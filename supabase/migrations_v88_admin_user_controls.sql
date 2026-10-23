-- AIDIL STORE v88: kontrol admin untuk pengguna.
--   1) Kolom status akun (ACTIVE/BLOCKED) + alasan blokir.
--   2) RPC admin_adjust_user_balance: tambah/kurangi saldo dengan alasan wajib,
--      audit + notifikasi + ledger ADJUSTMENT.
--   3) RPC admin_set_user_status: blokir/buka blokir dengan audit + notifikasi.
--   4) Guard ACCOUNT_BLOCKED untuk semua transaksi yang memindahkan saldo.
--
-- Jalankan setelah v87. Seluruh fungsi bersifat SECURITY DEFINER dan tetap
-- memeriksa role admin dari dalam database, bukan hanya dari API.

-- =========================================================
-- 1) Status akun pada profiles
-- =========================================================
alter table public.profiles
  add column if not exists account_status text not null default 'ACTIVE',
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('ACTIVE', 'BLOCKED'));
  end if;
end $$;

create index if not exists idx_profiles_account_status
  on public.profiles (account_status)
  where account_status = 'BLOCKED';

-- =========================================================
-- 2) Helper status akun
-- =========================================================
-- Role admin untuk operasi wallet: SUPER_ADMIN, ADMIN, dan STAFF.
-- is_admin() bawaan hanya mencakup ADMIN/SUPER_ADMIN sehingga tidak dipakai
-- di sini agar STAFF tetap bisa melakukan penyesuaian saldo.
create or replace function public.is_admin_or_staff()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('SUPER_ADMIN', 'ADMIN', 'STAFF')
  );
$$;

revoke all on function public.is_admin_or_staff() from public, anon;
grant execute on function public.is_admin_or_staff() to authenticated, service_role;

create or replace function public.is_account_blocked(p_user_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and account_status = 'BLOCKED'
  );
$$;

revoke all on function public.is_account_blocked(uuid) from public, anon;
grant execute on function public.is_account_blocked(uuid) to authenticated, service_role;

-- Dipanggil di awal setiap RPC transaksi milik pengguna.
create or replace function public.assert_account_active(p_user_id uuid)
returns void
language plpgsql stable
security definer set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.profiles
    where id = p_user_id and account_status = 'BLOCKED'
  ) then
    raise exception 'ACCOUNT_BLOCKED';
  end if;
end;
$$;

revoke all on function public.assert_account_active(uuid) from public, anon;
grant execute on function public.assert_account_active(uuid) to authenticated, service_role;

-- =========================================================
-- 3) Guard debit wallet (jaring pengaman terakhir)
-- =========================================================
-- Setiap RPC transaksi sudah memanggil assert_account_active di awal, tetapi
-- trigger ini memastikan tidak ada jalur debit wallet yang lolos bila ada RPC
-- baru/terlewat. Admin (termasuk STAFF) dan service_role tetap diizinkan
-- supaya koreksi saldo dan proses internal tidak ikut tertahan.
create or replace function public.guard_blocked_wallet_debit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.balance < old.balance
     and exists (
       select 1
       from public.wallets w
       join public.profiles p on p.id = w.user_id
       where w.id = new.id and p.account_status = 'BLOCKED'
     )
     and not public.is_admin_or_staff()
     and coalesce(auth.role(), '') <> 'service_role'
  then
    raise exception 'ACCOUNT_BLOCKED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_blocked_wallet_debit on public.wallets;
create trigger trg_guard_blocked_wallet_debit
  before update of balance on public.wallets
  for each row execute function public.guard_blocked_wallet_debit();

-- =========================================================
-- 4) RPC: penyesuaian saldo oleh admin (CREDIT / DEBIT)
-- =========================================================
create or replace function public.admin_adjust_user_balance(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_amount bigint,
  p_direction text,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, extensions
as $$
declare
  v_role text;
  v_wallet public.wallets%rowtype;
  v_reason text;
  v_admin_name text;
  v_delta bigint;
  v_before bigint;
  v_after bigint;
  v_ref uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_admin_id is null or p_admin_id <> auth.uid() then
    raise exception 'ADMIN_MISMATCH';
  end if;

  select role into v_role from public.profiles where id = p_admin_id;
  if v_role is null or v_role not in ('SUPER_ADMIN', 'ADMIN', 'STAFF') then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_direction is null or p_direction not in ('CREDIT', 'DEBIT') then
    raise exception 'INVALID_DIRECTION';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.wallets (user_id, balance)
  values (p_target_user_id, 0)
  on conflict (user_id) do nothing;

  -- Kunci baris wallet supaya dua admin tidak menimpa saldo bersamaan.
  select * into v_wallet from public.wallets where user_id = p_target_user_id for update;

  v_delta := case when p_direction = 'CREDIT' then p_amount else -p_amount end;
  v_before := v_wallet.balance;
  v_after := v_before + v_delta;

  if v_after < 0 then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update public.wallets
     set balance = v_after, updated_at = now()
   where id = v_wallet.id;

  v_ref := extensions.uuid_generate_v4();
  select coalesce(nullif(btrim(full_name), ''), email, 'Admin')
    into v_admin_name
    from public.profiles where id = p_admin_id;

  insert into public.wallet_transactions (
    wallet_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description
  )
  values (
    v_wallet.id, 'ADJUSTMENT', v_delta, v_before, v_after,
    'admin_adjustment', v_ref,
    'Penyesuaian saldo oleh ' || v_admin_name || ' (' || p_direction || '): ' || v_reason
  );

  insert into public.wallet_adjustments (user_id, amount, reason, admin_id)
  values (p_target_user_id, v_delta, v_reason, p_admin_id);

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    p_admin_id, 'wallet.admin_adjust', 'profile', p_target_user_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'amount', p_amount,
      'direction', p_direction,
      'reason', v_reason,
      'balance_before', v_before,
      'balance_after', v_after
    )
  );

  insert into public.notifications (user_id, title, message, reference_type, reference_id)
  values (
    p_target_user_id,
    case when p_direction = 'CREDIT' then 'Saldo Bertambah' else 'Saldo Berkurang' end,
    'Saldo kamu ' || case when p_direction = 'CREDIT' then 'bertambah ' else 'berkurang ' end ||
      'Rp' || to_char(p_amount, 'FM999G999G999G999') || '. Alasan: ' || left(v_reason, 200),
    'wallet_adjustment', v_ref
  );

  return jsonb_build_object(
    'ok', true,
    'direction', p_direction,
    'amount', p_amount,
    'balance_before', v_before,
    'balance_after', v_after
  );
end;
$$;

revoke all on function public.admin_adjust_user_balance(uuid, uuid, bigint, text, text) from public, anon;
grant execute on function public.admin_adjust_user_balance(uuid, uuid, bigint, text, text) to authenticated, service_role;

-- =========================================================
-- 5) RPC: blokir / buka blokir akun
-- =========================================================
create or replace function public.admin_set_user_status(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_role text;
  v_reason text;
  v_target public.profiles%rowtype;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_admin_id is null or p_admin_id <> auth.uid() then
    raise exception 'ADMIN_MISMATCH';
  end if;

  select role into v_role from public.profiles where id = p_admin_id;
  if v_role is null or v_role not in ('SUPER_ADMIN', 'ADMIN', 'STAFF') then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_status is null or p_status not in ('ACTIVE', 'BLOCKED') then
    raise exception 'INVALID_STATUS';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));

  select * into v_target from public.profiles where id = p_target_user_id for update;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if p_status = 'BLOCKED' and char_length(v_reason) < 5 then
    raise exception 'REASON_REQUIRED';
  end if;
  if p_status = 'ACTIVE' and v_reason = '' then
    v_reason := null;
  end if;

  update public.profiles
     set account_status = p_status,
         blocked_at = case when p_status = 'BLOCKED' then now() else null end,
         blocked_reason = case when p_status = 'BLOCKED' then v_reason else null end,
         updated_at = now()
   where id = p_target_user_id;

  v_action := case when p_status = 'BLOCKED' then 'user.blocked' else 'user.unblocked' end;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    p_admin_id, 'user.admin_status', 'profile', p_target_user_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'status', p_status,
      'previous_status', v_target.account_status,
      'reason', v_reason
    )
  );

  insert into public.notifications (user_id, title, message, reference_type, reference_id)
  values (
    p_target_user_id,
    case when p_status = 'BLOCKED' then 'Akun Diblokir' else 'Akun Aktif Kembali' end,
    case when p_status = 'BLOCKED'
      then 'Akun kamu diblokir. Alasan: ' || left(v_reason, 200) || '. Hubungi CS AIDIL STORE jika perlu bantuan.'
      else 'Akun kamu sudah aktif kembali dan dapat digunakan seperti biasa.'
    end,
    v_action, p_target_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'status', p_status,
    'previous_status', v_target.account_status,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.admin_set_user_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_status(uuid, uuid, text, text) to authenticated, service_role;

-- =========================================================
-- 6) Guard ACCOUNT_BLOCKED pada RPC transaksi yang sudah ada
-- =========================================================
-- Definisi fungsi di bawah disalin persis dari migrasi asalnya (v11, v45,
-- v19, v13, v7, v83, v75) lalu ditambah satu pemanggilan
-- assert_account_active tepat setelah pemeriksaan USER_ID_MISMATCH.
-- Dijalankan ulang di sini agar aturan blokir tidak bisa dilewati lewat RPC.


-- checkout (dari migrations_v11_ppob_wallet_checkout.sql)
create or replace function public.checkout(
  p_user_id uuid,
  p_items jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_wallet wallets%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_product products%rowtype;
  v_total bigint := 0;
  v_subtotal bigint;
  v_order_number text;
  v_has_ppob boolean := false;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  perform public.assert_account_active(p_user_id);
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'INVALID_ITEMS'; end if;
  select id into v_order_id from orders where idempotency_key = p_idempotency_key;
  if found then return v_order_id; end if;
  select * into v_wallet from wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  v_order_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6);
  insert into orders (order_number, user_id, total_amount, status, idempotency_key)
  values (v_order_number, p_user_id, 0, 'PENDING', p_idempotency_key) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then raise exception 'INVALID_ITEM'; end if;
    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from products where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND_OR_INACTIVE'; end if;
    if exists (select 1 from ppob_services ps where ps.product_id = v_product.id and ps.provider_active = true) then v_has_ppob := true; end if;
    v_subtotal := v_product.price * (v_item->>'quantity')::int;
    v_total := v_total + v_subtotal;
    insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::int, v_subtotal);
  end loop;

  if v_wallet.balance < v_total then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update wallets set balance = balance - v_total, updated_at = now() where id = v_wallet.id;
  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_wallet.id, 'PURCHASE', -v_total, v_wallet.balance, v_wallet.balance - v_total, 'order', v_order_id, 'Pembelian produk');

  update orders set total_amount = v_total,
    status = case when v_has_ppob then 'PROCESSING' when not exists (
      select 1 from order_items oi join products p on p.id = oi.product_id
      where oi.order_id = v_order_id and coalesce(p.product_type, 'digital') <> 'digital'
    ) then 'COMPLETED' else 'PROCESSING' end,
    updated_at = now() where id = v_order_id;

  insert into audit_logs (actor_id, action, target_type, target_id) values (p_user_id, 'order.purchase', 'order', v_order_id);
  return v_order_id;
end;
$$;

-- checkout_with_voucher (dari migrations_v45_production_hardening.sql)
create or replace function public.checkout_with_voucher(p_user_id uuid,p_items jsonb,p_idempotency_key text,p_voucher_code text default null)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare
  v_wallet wallets%rowtype; v_order_id uuid; v_item jsonb; v_product products%rowtype;
  v_total bigint:=0; v_subtotal bigint; v_order_number text; v_has_ppob boolean:=false;
  v_voucher promo_vouchers%rowtype; v_used integer; v_discount bigint:=0;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id<>auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  perform public.assert_account_active(p_user_id);
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 then raise exception 'INVALID_ITEMS'; end if;
  select id into v_order_id from orders where idempotency_key=p_idempotency_key;
  if found then return v_order_id; end if;
  select * into v_wallet from wallets where user_id=p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  v_order_number:='INV-'||to_char(now(),'YYYYMMDD')||'-'||substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,6);
  insert into orders(order_number,user_id,total_amount,status,idempotency_key) values(v_order_number,p_user_id,0,'PENDING',p_idempotency_key) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then raise exception 'INVALID_ITEM'; end if;
    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from products where id=(v_item->>'product_id')::uuid and is_active=true for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND_OR_INACTIVE'; end if;
    if exists(select 1 from ppob_services ps where ps.product_id=v_product.id and ps.provider_active=true) then v_has_ppob:=true; end if;
    v_subtotal:=v_product.price*(v_item->>'quantity')::int; v_total:=v_total+v_subtotal;
    insert into order_items(order_id,product_id,product_name,unit_price,quantity,subtotal) values(v_order_id,v_product.id,v_product.name,v_product.price,(v_item->>'quantity')::int,v_subtotal);
  end loop;
  if trim(coalesce(p_voucher_code,''))<>'' then
    select * into v_voucher from promo_vouchers where upper(code)=upper(trim(p_voucher_code)) and is_active and starts_at<=now() and (expires_at is null or expires_at>now()) for update;
    if not found then raise exception 'VOUCHER_INVALID'; end if;
    if v_voucher.usage_limit is not null and v_voucher.used_count>=v_voucher.usage_limit then raise exception 'VOUCHER_LIMIT'; end if;
    select count(*) into v_used from promo_redemptions where voucher_id=v_voucher.id and user_id=p_user_id;
    if v_used>=v_voucher.usage_per_user then raise exception 'VOUCHER_USER_LIMIT'; end if;
    if v_total<v_voucher.min_order_amount then raise exception 'VOUCHER_MIN_ORDER'; end if;
    v_discount:=case when v_voucher.discount_type='PERCENTAGE' then floor(v_total*v_voucher.discount_value/100.0) else v_voucher.discount_value end;
    if v_voucher.max_discount is not null then v_discount:=least(v_discount,v_voucher.max_discount); end if;
    v_discount:=least(greatest(v_discount,0),v_total);
    insert into promo_redemptions(voucher_id,user_id,order_id,discount_amount) values(v_voucher.id,p_user_id,v_order_id,v_discount);
    update promo_vouchers set used_count=used_count+1,updated_at=now() where id=v_voucher.id;
  end if;
  v_total:=v_total-v_discount;
  if v_wallet.balance<v_total then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update wallets set balance=balance-v_total,updated_at=now() where id=v_wallet.id;
  insert into wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
    values(v_wallet.id,'PURCHASE',-v_total,v_wallet.balance,v_wallet.balance-v_total,'order',v_order_id,'Pembelian produk');
  update orders set total_amount=v_total,discount_amount=v_discount,voucher_id=v_voucher.id,
    status=case when v_has_ppob then 'PROCESSING' when not exists(select 1 from order_items oi join products p on p.id=oi.product_id where oi.order_id=v_order_id and coalesce(p.product_type,'digital')<>'digital') then 'COMPLETED' else 'PROCESSING' end,
    updated_at=now() where id=v_order_id;
  insert into audit_logs(actor_id,action,target_type,target_id) values(p_user_id,'order.purchase','order',v_order_id);
  return v_order_id;
end $$;

-- create_wallet_transfer (dari migrations_v75_wallet_transfer_qr.sql)
create or replace function public.create_wallet_transfer(
  p_user_id uuid,
  p_recipient_id uuid,
  p_amount bigint,
  p_note text,
  p_idempotency_key text
)
returns uuid
language plpgsql volatile
security definer set search_path = public, extensions
as $$
declare
  v_sender_wallet wallets%rowtype;
  v_recipient_wallet wallets%rowtype;
  v_settings transfer_settings%rowtype;
  v_sender_name text;
  v_recipient_name text;
  v_fee bigint;
  v_total bigint;
  v_transfer_id uuid;
  v_transfer_number text;
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_used_today bigint;
  v_used_month bigint;
begin
  -- SECURITY DEFINER tetap wajib memastikan transfer hanya untuk user yang login.
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_user_id <> auth.uid() then
    raise exception 'USER_ID_MISMATCH';
  end if;
  perform public.assert_account_active(p_user_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if p_recipient_id is null or p_recipient_id = p_user_id then
    raise exception 'SELF_TRANSFER';
  end if;

  -- Idempotency: key yang sama (milik pengirim yang sama) mengembalikan
  -- transfer yang sudah ada.
  select id into v_transfer_id from wallet_transfers
    where sender_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return v_transfer_id;
  end if;

  select * into v_settings from transfer_settings where id = 1;
  if not found or not v_settings.enabled then
    raise exception 'TRANSFER_DISABLED';
  end if;

  if p_amount < v_settings.min_transfer then
    raise exception 'BELOW_MIN_TRANSFER';
  end if;

  if p_amount > v_settings.max_transfer then
    raise exception 'ABOVE_MAX_TRANSFER';
  end if;

  if char_length(coalesce(p_note, '')) > 140 then
    raise exception 'INVALID_NOTE';
  end if;

  -- Penerima wajib ada (profil) sebelum saldo disentuh.
  select coalesce(nullif(btrim(full_name), ''), 'Pengguna AIDIL STORE') into v_recipient_name
    from profiles where id = p_recipient_id;
  if v_recipient_name is null then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'Pengguna AIDIL STORE') into v_sender_name
    from profiles where id = p_user_id;

  -- Biaya admin dibayar pengirim.
  if v_settings.fee_type = 'PERCENTAGE' then
    v_fee := ceil(p_amount * v_settings.fee_value / 100.0)::bigint;
  else
    v_fee := round(v_settings.fee_value)::bigint;
  end if;

  v_total := p_amount + v_fee;

  -- Kunci kedua wallet dengan urutan tetap untuk mencegah deadlock.
  if p_user_id::text < p_recipient_id::text then
    perform 1 from wallets where user_id = p_user_id for update;
    perform 1 from wallets where user_id = p_recipient_id for update;
  else
    perform 1 from wallets where user_id = p_recipient_id for update;
    perform 1 from wallets where user_id = p_user_id for update;
  end if;

  select * into v_sender_wallet from wallets where user_id = p_user_id;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  select * into v_recipient_wallet from wallets where user_id = p_recipient_id;
  if not found then
    raise exception 'RECIPIENT_WALLET_NOT_FOUND';
  end if;

  -- Limit harian & bulanan (zona waktu Asia/Jakarta), dihitung dari total.
  v_day_start := date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  v_month_start := date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';

  select coalesce(sum(total), 0) into v_used_today
    from wallet_transfers
    where sender_id = p_user_id and created_at >= v_day_start;
  if v_used_today + v_total > v_settings.daily_limit then
    raise exception 'DAILY_LIMIT_EXCEEDED';
  end if;

  select coalesce(sum(total), 0) into v_used_month
    from wallet_transfers
    where sender_id = p_user_id and created_at >= v_month_start;
  if v_used_month + v_total > v_settings.monthly_limit then
    raise exception 'MONTHLY_LIMIT_EXCEEDED';
  end if;

  if v_sender_wallet.balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  v_transfer_number := 'TRF-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 8));

  begin
    insert into wallet_transfers (transfer_number, sender_id, recipient_id, amount, fee, total, note, idempotency_key)
    values (v_transfer_number, p_user_id, p_recipient_id, p_amount, v_fee, v_total,
            nullif(btrim(coalesce(p_note, '')), ''), p_idempotency_key)
    returning id into v_transfer_id;
  exception when unique_violation then
    -- Balapan request paralel dengan key yang sama: pakai transfer yang sudah dibuat.
    select id into v_transfer_id from wallet_transfers
      where sender_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return v_transfer_id;
    end if;
    raise;
  end;

  -- Debit pengirim (nominal + biaya admin).
  update wallets set balance = balance - v_total, updated_at = now() where id = v_sender_wallet.id;
  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_sender_wallet.id, 'TRANSFER', -v_total, v_sender_wallet.balance, v_sender_wallet.balance - v_total,
          'transfer', v_transfer_id, 'Transfer ke ' || v_recipient_name);

  -- Kredit penerima (nominal penuh, tanpa biaya admin).
  update wallets set balance = balance + p_amount, updated_at = now() where id = v_recipient_wallet.id;
  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_recipient_wallet.id, 'TRANSFER', p_amount, v_recipient_wallet.balance, v_recipient_wallet.balance + p_amount,
          'transfer', v_transfer_id, 'Transfer dari ' || v_sender_name);

  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_user_id, 'transfer.sent', 'wallet_transfer', v_transfer_id,
          jsonb_build_object(
            'recipient_id', p_recipient_id,
            'amount', p_amount,
            'fee', v_fee,
            'total', v_total,
            'transfer_number', v_transfer_number
          ));

  return v_transfer_id;
end;
$$;

-- create_ppob_prepaid_wallet_order (dari migrations_v19_ppob_wallet_atomic.sql)
create or replace function public.create_ppob_prepaid_wallet_order(
  p_user_id uuid,
  p_product_id uuid,
  p_customer_no text,
  p_target_data jsonb default '{}'::jsonb,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_service ppob_services%rowtype;
  v_product products%rowtype;
  v_wallet wallets%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_before bigint;
  v_after bigint;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  perform public.assert_account_active(p_user_id);
  if coalesce(trim(p_customer_no),'') = '' then raise exception 'TARGET_REQUIRED'; end if;
  if length(p_idempotency_key) < 10 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;

  -- Same key always returns the original order; no second wallet debit.
  select id into v_order_id from orders where idempotency_key=p_idempotency_key;
  if found then
    if exists(select 1 from orders where id=v_order_id and user_id=p_user_id) then return v_order_id; end if;
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
  end if;

  select * into v_service from ppob_services
    where product_id=p_product_id and provider_active=true and service_kind='prepaid'
    limit 1;
  if not found then raise exception 'PPOB_SERVICE_NOT_FOUND'; end if;

  select * into v_product from products where id=p_product_id and is_active=true for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  select * into v_wallet from wallets where user_id=p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.balance < v_product.price then raise exception 'INSUFFICIENT_BALANCE'; end if;

  v_order_number := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,8);
  insert into orders(order_number,user_id,total_amount,status,idempotency_key,payment_method,gateway_reference)
  values(v_order_number,p_user_id,v_product.price,'PROCESSING',p_idempotency_key,'WALLET',v_order_number)
  returning id into v_order_id;

  insert into order_items(order_id,product_id,product_name,unit_price,quantity,subtotal)
  values(v_order_id,v_product.id,v_product.name,v_product.price,1,v_product.price)
  returning id into v_item_id;

  v_before := v_wallet.balance;
  v_after := v_before - v_product.price;
  update wallets set balance=v_after, updated_at=now() where id=v_wallet.id;
  insert into wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
  values(v_wallet.id,'PURCHASE',-v_product.price,v_before,v_after,'order',v_order_id,'Pembayaran PPOB prabayar');

  v_ref := 'AS-' || replace(v_order_id::text,'-','') || '-' || replace(v_item_id::text,'-','');
  insert into ppob_order_targets(order_item_id,customer_no,target_data)
  values(v_item_id,trim(p_customer_no),coalesce(p_target_data,'{}'::jsonb));
  insert into ppob_transactions(order_id,order_item_id,service_id,provider,provider_ref_id,customer_no,target_data,status)
  values(v_order_id,v_item_id,v_service.id,v_service.provider,v_ref,trim(p_customer_no),coalesce(p_target_data,'{}'::jsonb),'WAITING');

  insert into audit_logs(actor_id,action,target_type,target_id,metadata)
  values(p_user_id,'ppob.prepaid_wallet_paid','order',v_order_id,jsonb_build_object('product_id',p_product_id,'amount',v_product.price,'provider',v_service.provider));

  return v_order_id;
exception
  when unique_violation then
    select id into v_order_id from orders where idempotency_key=p_idempotency_key and user_id=p_user_id;
    if v_order_id is not null then return v_order_id; end if;
    raise;
end; $$;

-- create_ppob_postpaid_wallet_order (dari migrations_v13_ppob_postpaid_flow.sql)
create or replace function public.create_ppob_postpaid_wallet_order(
  p_user_id uuid, p_inquiry_id uuid, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_i ppob_inquiries%rowtype;
  v_wallet wallets%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_balance_before bigint;
  v_balance_after bigint;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  perform public.assert_account_active(p_user_id);
  select * into v_i from ppob_inquiries where id = p_inquiry_id for update;
  if not found or v_i.user_id <> p_user_id then raise exception 'INQUIRY_NOT_FOUND'; end if;
  if v_i.status <> 'ACTIVE' or v_i.expires_at <= now() then
    update ppob_inquiries set status='EXPIRED' where id=v_i.id and status='ACTIVE';
    raise exception 'INQUIRY_EXPIRED';
  end if;
  if v_i.order_id is not null then
    return v_i.order_id;
  end if;
  select id into v_order_id from orders where idempotency_key = p_idempotency_key;
  if found then return v_order_id; end if;

  select * into v_wallet from wallets where user_id=p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.balance < v_i.quote_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;

  v_order_number := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,8);
  insert into orders(order_number,user_id,total_amount,status,idempotency_key,payment_method,gateway_reference)
  values(v_order_number,p_user_id,v_i.quote_amount,'PROCESSING',p_idempotency_key,'WALLET',v_order_number)
  returning id into v_order_id;

  insert into order_items(order_id,product_id,product_name,unit_price,quantity,subtotal)
  select v_order_id,p.id,p.name,v_i.quote_amount,1,v_i.quote_amount from products p where p.id=v_i.product_id and p.is_active=true;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  select id into v_item_id from order_items where order_id=v_order_id limit 1;

  v_balance_before := v_wallet.balance;
  v_balance_after := v_wallet.balance - v_i.quote_amount;
  update wallets set balance=v_balance_after,updated_at=now() where id=v_wallet.id;
  insert into wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
  values(v_wallet.id,'PURCHASE',-v_i.quote_amount,v_balance_before,v_balance_after,'order',v_order_id,'Pembayaran PPOB pascabayar');

  v_ref := 'AS-' || replace(v_order_id::text,'-','') || '-' || replace(v_item_id::text,'-','');
  insert into ppob_order_targets(order_item_id,customer_no,target_data)
  values(v_item_id,v_i.customer_no,v_i.payload)
  on conflict(order_item_id) do update set customer_no=excluded.customer_no,target_data=excluded.target_data,updated_at=now();
  insert into ppob_transactions(order_id,order_item_id,service_id,provider,provider_ref_id,customer_no,target_data,status)
  select v_order_id,v_item_id,ps.id,ps.provider,v_ref,v_i.customer_no,v_i.payload,'WAITING'
  from ppob_services ps where ps.id=v_i.service_id and ps.provider_active=true;
  if not found then raise exception 'PPOB_SERVICE_NOT_FOUND'; end if;

  update ppob_inquiries set status='USED',order_id=v_order_id,used_at=now() where id=v_i.id;
  insert into audit_logs(actor_id,action,target_type,target_id,metadata)
  values(p_user_id,'ppob.postpaid_wallet_paid','order',v_order_id,jsonb_build_object('inquiry_id',v_i.id,'amount',v_i.quote_amount));
  return v_order_id;
end; $$;

-- create_ppob_postpaid_gateway_order (dari migrations_v13_ppob_postpaid_flow.sql)
create or replace function public.create_ppob_postpaid_gateway_order(
  p_user_id uuid, p_inquiry_id uuid, p_idempotency_key text, p_payment_method text, p_gateway_method text
) returns table(order_id uuid,order_number text,total_amount bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_i ppob_inquiries%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  perform public.assert_account_active(p_user_id);
  if p_payment_method not in ('QRIS','BANK_VA') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select * into v_i from ppob_inquiries where id=p_inquiry_id for update;
  if not found or v_i.user_id<>p_user_id then raise exception 'INQUIRY_NOT_FOUND'; end if;
  if v_i.status<>'ACTIVE' or v_i.expires_at<=now() then
    update ppob_inquiries set status='EXPIRED' where id=v_i.id and status='ACTIVE';
    raise exception 'INQUIRY_EXPIRED';
  end if;
  if v_i.order_id is not null then
    return query select o.id,o.order_number,o.total_amount from orders o where o.id=v_i.order_id;
    return;
  end if;
  select o.id,o.order_number,o.total_amount into v_order_id,v_order_number,v_i.quote_amount from orders o where o.idempotency_key=p_idempotency_key;
  if found then return query select v_order_id,v_order_number,v_i.quote_amount; return; end if;
  if not exists(select 1 from products where id=v_i.product_id and is_active=true) then raise exception 'PRODUCT_NOT_FOUND'; end if;
  v_order_number := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,8);
  insert into orders(order_number,user_id,total_amount,status,idempotency_key,payment_method,gateway_reference,gateway_method)
  values(v_order_number,p_user_id,v_i.quote_amount,'PENDING',p_idempotency_key,p_payment_method,v_order_number,p_gateway_method)
  returning id into v_order_id;
  insert into order_items(order_id,product_id,product_name,unit_price,quantity,subtotal)
  select v_order_id,p.id,p.name,v_i.quote_amount,1,v_i.quote_amount from products p where p.id=v_i.product_id;
  select id into v_item_id from order_items where order_id=v_order_id limit 1;
  v_ref := 'AS-' || replace(v_order_id::text,'-','') || '-' || replace(v_item_id::text,'-','');
  insert into ppob_order_targets(order_item_id,customer_no,target_data) values(v_item_id,v_i.customer_no,v_i.payload);
  insert into ppob_transactions(order_id,order_item_id,service_id,provider,provider_ref_id,customer_no,target_data,status)
  select v_order_id,v_item_id,ps.id,ps.provider,v_ref,v_i.customer_no,v_i.payload,'WAITING' from ppob_services ps where ps.id=v_i.service_id and ps.provider_active=true;
  if not found then raise exception 'PPOB_SERVICE_NOT_FOUND'; end if;
  update ppob_inquiries set status='USED',order_id=v_order_id,used_at=now() where id=v_i.id;
  return query select v_order_id,v_order_number,v_i.quote_amount;
end; $$;

-- create_qris_order (dari migrations_v7_qris_payment.sql)
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
  perform public.assert_account_active(p_user_id);

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

-- create_gateway_order (dari migrations_v83_midtrans_gateway.sql)
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
  perform public.assert_account_active(p_user_id);
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
