-- AIDIL STORE v83 — Ganti gateway pembayaran dari FR3 NEWERA ke Midtrans (Core API).
-- Jalankan SETELAH v82. File migration lama TIDAK diubah (append-only).
-- Isi migration ini hanya menyesuaikan fungsi & baris data yang bergantung provider:
--   1. confirm_gateway_topup menerima provider 'midtrans' (nilai legacy tetap diterima
--      agar baris lama yang masih PENDING/VERIFYING tetap bisa diselesaikan).
--   2. create_gateway_order menerima gateway_method 'bca_va' (Virtual Account BCA Midtrans).
--   3. topup_payment_methods: tambah baris bca_va & nonaktifkan metode yang tidak
--      didukung Midtrans.
-- Tidak ada perubahan struktur tabel/kolom/constraint.

-- === 1) confirm_gateway_topup (v74) — tambah 'midtrans' ===
create or replace function public.confirm_gateway_topup(
  p_topup_id uuid,
  p_payment_method text,
  p_completed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup public.topups%rowtype;
  v_wallet public.wallets%rowtype;
begin
  select * into v_topup from public.topups where id = p_topup_id for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if v_topup.status = 'APPROVED' then return; end if;
  if v_topup.status not in ('PENDING','VERIFYING') then raise exception 'TOPUP_NOT_PAYABLE'; end if;
  -- 'fr3newera' dan 'pakasir' tetap diterima untuk kompatibilitas mundur terhadap
  -- baris lama yang mungkin masih berstatus PENDING/VERIFYING saat migration ini
  -- dijalankan. Top up baru selalu memakai 'midtrans'.
  if coalesce(v_topup.provider, '') not in ('midtrans', 'fr3newera', 'pakasir') then
    raise exception 'INVALID_TOPUP_PROVIDER';
  end if;

  insert into public.wallets(user_id, balance)
  values (v_topup.user_id, 0)
  on conflict (user_id) do nothing;

  select * into v_wallet from public.wallets where user_id = v_topup.user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  update public.wallets
  set balance = balance + v_topup.amount, updated_at = now()
  where id = v_wallet.id;

  insert into public.wallet_transactions(
    wallet_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description
  ) values (
    v_wallet.id, 'TOPUP', v_topup.amount, v_wallet.balance,
    v_wallet.balance + v_topup.amount, 'topup', v_topup.id,
    'Top Up otomatis'
  );

  update public.topups
  set status = 'APPROVED', payment_method = coalesce(p_payment_method, payment_method),
      paid_at = coalesce(p_completed_at, now()), reviewed_at = coalesce(reviewed_at, now()),
      updated_at = now()
  where id = v_topup.id;

  insert into public.audit_logs(actor_id, action, target_type, target_id, metadata)
  values (v_topup.user_id, 'topup.gateway_paid', 'topup', v_topup.id,
          jsonb_build_object('provider', v_topup.provider, 'amount', v_topup.amount, 'payment_method', p_payment_method));

  insert into public.notifications(user_id, title, message, reference_type, reference_id)
  values (v_topup.user_id, 'Top Up Berhasil', 'Saldo ' || v_topup.amount || ' berhasil ditambahkan secara otomatis.', 'topup', v_topup.id);
end;
$$;

revoke all on function public.confirm_gateway_topup(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_gateway_topup(uuid,text,timestamptz) to service_role;

-- === 2) create_gateway_order (v8) — tambah gateway_method 'bca_va' ===
create or replace function public.create_gateway_order(
  p_user_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_payment_method text,
  p_gateway_method text
)
returns table (order_id uuid, order_number text, total_amount bigint)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product products%rowtype;
  v_total bigint := 0;
  v_subtotal bigint;
  v_existing orders%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  if p_payment_method not in ('QRIS', 'BANK_VA') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  -- Metode Midtrans (qris + VA bca/bri/bni/permata) ditambah 'bca_va'; nilai lama
  -- dipertahankan supaya order lama / pemanggil lama tidak error.
  if p_gateway_method not in (
    'qris','bca_va','bri_va','bni_va','cimb_niaga_va','sampoerna_va',
    'bnc_va','maybank_va','permata_va','atm_bersama_va','artha_graha_va'
  ) then raise exception 'INVALID_GATEWAY_METHOD'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'INVALID_ITEMS';
  end if;

  select * into v_existing from orders where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payment_method in ('QRIS','BANK_VA') then
      return query select v_existing.id, v_existing.order_number, v_existing.total_amount;
      return;
    end if;
    raise exception 'ORDER_ALREADY_PAID';
  end if;

  v_order_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' ||
    substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 8);

  insert into orders (
    order_number, user_id, total_amount, status, idempotency_key,
    payment_method, gateway_reference, gateway_method
  )
  values (
    v_order_number, p_user_id, 0, 'PENDING', p_idempotency_key,
    p_payment_method, v_order_number, p_gateway_method
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then
      raise exception 'INVALID_ITEM';
    end if;

    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_QUANTITY';
    end if;

    select * into v_product
      from products
      where id = (v_item->>'product_id')::uuid and is_active = true
      for update;

    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    v_subtotal := v_product.price * (v_item->>'quantity')::int;
    v_total := v_total + v_subtotal;

    insert into order_items (
      order_id, product_id, product_name, unit_price, quantity, subtotal
    )
    values (
      v_order_id, v_product.id, v_product.name, v_product.price,
      (v_item->>'quantity')::int, v_subtotal
    );
  end loop;

  update orders set total_amount = v_total, updated_at = now()
  where id = v_order_id;

  return query select v_order_id, v_order_number, v_total;
end;
$$;

revoke all on function public.create_gateway_order(uuid, jsonb, text, text, text) from public;
grant execute on function public.create_gateway_order(uuid, jsonb, text, text, text) to authenticated;

-- === 3) topup_payment_methods — tambah bca_va, matikan metode non-Midtrans ===
insert into public.topup_payment_methods(provider_method,label,description,payment_type,sort_order) values
('bca_va','BCA Virtual Account','Bayar melalui BCA atau kanal yang mendukung BCA VA.','VA',15)
on conflict(provider_method) do nothing;

update public.topup_payment_methods
set is_active = false, updated_at = now()
where provider_method in ('cimb_niaga_va','maybank_va','bnc_va','sampoerna_va','atm_bersama_va','artha_graha_va');
