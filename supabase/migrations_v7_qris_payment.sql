-- =========================================================
-- MIGRATION v7 — Pembayaran QRIS Otomatis (Pakasir)
-- Jalankan SEKALI di Supabase SQL Editor setelah migration v6.
--
-- Menambahkan dukungan bayar QRIS otomatis di samping saldo wallet:
-- - orders.payment_method: 'WALLET' (default, alur lama) atau 'QRIS'
-- - orders.gateway_reference: order_id yang dikirim ke Pakasir (= order_number)
-- - orders.qris_payload: string QR (EMV) dari Pakasir, dipakai untuk render QR code
-- - orders.qris_expired_at: waktu kadaluarsa QR
-- - orders.paid_at: waktu pembayaran QRIS dikonfirmasi
-- =========================================================

alter table orders add column if not exists payment_method text not null default 'WALLET';
alter table orders add column if not exists gateway_reference text;
alter table orders add column if not exists qris_payload text;
alter table orders add column if not exists qris_expired_at timestamptz;
alter table orders add column if not exists paid_at timestamptz;

-- Pastikan idempotency_key tetap bisa null untuk order lama, tapi order QRIS baru
-- akan selalu mengisi idempotency_key juga (dibuat di API, bukan RPC checkout()).

-- =========================================================
-- FUNGSI: buat order QRIS TANPA memotong saldo wallet.
-- Item & harga selalu diambil dari database (tidak percaya client).
-- Order dibuat dengan status PENDING; baru diselesaikan setelah
-- webhook/verifikasi Pakasir menyatakan status 'completed'.
-- =========================================================
create or replace function public.create_qris_order(
  p_user_id uuid,
  p_items jsonb,
  p_idempotency_key text
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
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_user_id <> auth.uid() then
    raise exception 'USER_ID_MISMATCH';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'INVALID_ITEMS';
  end if;

  select o.id, o.order_number, o.total_amount into v_order_id, v_order_number, v_total
    from orders o where o.idempotency_key = p_idempotency_key;
  if found then
    return query select v_order_id, v_order_number, v_total;
    return;
  end if;

  v_order_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6);

  insert into orders (order_number, user_id, total_amount, status, idempotency_key, payment_method, gateway_reference)
  values (v_order_number, p_user_id, 0, 'PENDING', p_idempotency_key, 'QRIS', v_order_number)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then
      raise exception 'INVALID_ITEM';
    end if;

    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_QUANTITY';
    end if;

    select * into v_product from products
      where id = (v_item->>'product_id')::uuid and is_active = true;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND_OR_INACTIVE';
    end if;

    v_subtotal := v_product.price * (v_item->>'quantity')::int;
    v_total := v_total + v_subtotal;

    insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::int, v_subtotal);
  end loop;

  update orders set total_amount = v_total, updated_at = now() where id = v_order_id;

  return query select v_order_id, v_order_number, v_total;
end;
$$;

revoke all on function public.create_qris_order(uuid, jsonb, text) from public;
grant execute on function public.create_qris_order(uuid, jsonb, text) to authenticated;

-- =========================================================
-- FUNGSI: konfirmasi pembayaran QRIS berhasil (dipanggil server
-- setelah verifikasi ke Pakasir Transaction Detail API berhasil).
-- Aman dipanggil berkali-kali (idempotent lewat pengecekan status).
-- =========================================================
create or replace function public.confirm_qris_payment(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_all_digital boolean;
begin
  select not exists (
    select 1 from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = p_order_id and coalesce(p.product_type, 'digital') <> 'digital'
  ) into v_all_digital;

  update orders
    set status = case when v_all_digital then 'COMPLETED' else 'PROCESSING' end,
        paid_at = coalesce(paid_at, now()),
        updated_at = now()
    where id = p_order_id and status = 'PENDING';

  insert into audit_logs (action, target_type, target_id)
  values ('order.qris_paid', 'order', p_order_id);
end;
$$;

-- PENTING: HANYA service_role (dipanggil server pakai createAdminClient()) yang boleh
-- eksekusi fungsi ini. Jangan pernah grant ke 'authenticated' — fungsi ini tidak
-- mengecek kepemilikan order, jadi kalau bisa dipanggil user biasa, mereka bisa
-- menandai pesanan sendiri "lunas" tanpa benar-benar membayar.
revoke all on function public.confirm_qris_payment(uuid) from public, authenticated, anon;
grant execute on function public.confirm_qris_payment(uuid) to service_role;
