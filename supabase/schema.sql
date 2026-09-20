-- =========================================================
-- AIDIL STORE — Core Database Schema (Supabase / Postgres)
-- Jalankan file ini di Supabase SQL Editor, urut dari atas.
-- =========================================================

create extension if not exists "uuid-ossp";

-- =========================================================
-- ENUM TYPES
-- =========================================================
create type user_role as enum ('USER', 'ADMIN', 'SUPER_ADMIN');
create type topup_status as enum ('PENDING', 'VERIFYING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');
create type order_status as enum ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');
create type wallet_tx_type as enum ('TOPUP', 'PURCHASE', 'REFUND', 'ADJUSTMENT');

-- =========================================================
-- PROFILES (1:1 dengan auth.users)
-- =========================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  avatar_url text,
  role user_role not null default 'USER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger: buat profile + wallet otomatis saat user baru daftar
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));

  insert into public.wallets (user_id, balance)
  values (new.id, 0);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- WALLETS & WALLET TRANSACTIONS (ledger)
-- =========================================================
create table wallets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table wallet_transactions (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid not null references wallets(id) on delete cascade,
  type wallet_tx_type not null,
  amount bigint not null, -- positif = kredit, negatif = debit
  balance_before bigint not null,
  balance_after bigint not null,
  reference_type text,     -- 'topup' | 'order' | dll
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- PAYMENT SETTINGS (dikelola admin, bukan hard-code)
-- =========================================================
create table payment_settings (
  id uuid primary key default uuid_generate_v4(),
  method text not null,          -- 'DANA' | 'GOPAY' | 'BANK_JAGO' | 'QRIS'
  account_number text not null,
  account_name text not null,
  instructions text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- =========================================================
-- TOP UPS
-- =========================================================
create table topups (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount bigint not null check (amount > 0),
  payment_method_id uuid references payment_settings(id),
  proof_url text,               -- path di storage (bukti transfer)
  status topup_status not null default 'PENDING',
  rejection_reason text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- CATEGORIES & PRODUCTS
-- =========================================================
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id),
  name text not null,
  slug text not null unique,
  description text,
  price bigint not null check (price >= 0),
  thumbnail_url text,
  product_type text not null default 'digital', -- tipe produk: digital
  stock int,               -- null = unlimited (produk digital)
  is_active boolean not null default true,
  digital_file_path text,  -- path privat di storage, untuk delivery via signed URL
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- ORDERS & ORDER ITEMS
-- =========================================================
create table orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  total_amount bigint not null check (total_amount >= 0),
  status order_status not null default 'PENDING',
  idempotency_key text unique, -- cegah double-submit dari checkout
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,   -- snapshot nama saat transaksi
  unit_price bigint not null,   -- snapshot harga saat transaksi (jangan percaya harga dari client)
  quantity int not null default 1,
  subtotal bigint not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

-- =========================================================
-- AUDIT LOG
-- =========================================================
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references profiles(id),
  action text not null,         -- 'login' | 'topup.approve' | dll
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- RLS: aktifkan di semua tabel
-- =========================================================
alter table profiles enable row level security;
alter table wallets enable row level security;
alter table wallet_transactions enable row level security;
alter table payment_settings enable row level security;
alter table topups enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

-- Helper: cek apakah user saat ini admin
create function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('ADMIN', 'SUPER_ADMIN')
  );
$$;

-- PROFILES
create policy "profiles_select_own_or_admin" on profiles
  for select using (id = auth.uid() or is_admin());
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());

-- WALLETS (read-only untuk user; perubahan HANYA lewat fungsi server security definer)
create policy "wallets_select_own_or_admin" on wallets
  for select using (user_id = auth.uid() or is_admin());

-- WALLET TRANSACTIONS
create policy "wallet_tx_select_own_or_admin" on wallet_transactions
  for select using (
    exists (select 1 from wallets w where w.id = wallet_id and (w.user_id = auth.uid() or is_admin()))
  );

-- PAYMENT SETTINGS (semua user login boleh baca yang aktif; hanya admin boleh ubah)
create policy "payment_settings_select_active" on payment_settings
  for select using (is_active = true or is_admin());
create policy "payment_settings_admin_write" on payment_settings
  for all using (is_admin()) with check (is_admin());

-- TOPUPS
create policy "topups_select_own_or_admin" on topups
  for select using (user_id = auth.uid() or is_admin());
create policy "topups_insert_own" on topups
  for insert with check (user_id = auth.uid());
create policy "topups_admin_update" on topups
  for update using (is_admin());

-- CATEGORIES & PRODUCTS (publik boleh baca produk aktif; hanya admin boleh tulis)
create policy "categories_select_all" on categories for select using (true);
create policy "categories_admin_write" on categories for all using (is_admin()) with check (is_admin());

create policy "products_select_active_or_admin" on products
  for select using (is_active = true or is_admin());
create policy "products_admin_write" on products
  for all using (is_admin()) with check (is_admin());

-- ORDERS & ORDER ITEMS
create policy "orders_select_own_or_admin" on orders
  for select using (user_id = auth.uid() or is_admin());
create policy "orders_admin_update" on orders
  for update using (is_admin());

create policy "order_items_select_own_or_admin" on order_items
  for select using (
    exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin()))
  );

-- NOTIFICATIONS
create policy "notifications_select_own" on notifications
  for select using (user_id = auth.uid());
create policy "notifications_update_own" on notifications
  for update using (user_id = auth.uid());


-- PAYMENTS: user hanya dapat melihat pembayaran miliknya; admin dapat melihat semua

-- AUDIT LOGS (hanya admin yang boleh baca)
create policy "audit_logs_admin_select" on audit_logs
  for select using (is_admin());

-- =========================================================
-- FUNGSI ATOMIC: APPROVE TOP UP
-- Dipanggil dari API route admin (server-side, pakai service role
-- atau security definer). Mencegah approval ganda.
-- =========================================================
create function public.approve_topup(p_topup_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_topup topups%rowtype;
  v_wallet wallets%rowtype;
begin
  -- SECURITY DEFINER tetap wajib memvalidasi identitas pemanggil.
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not exists (
    select 1 from profiles
    where id = auth.uid() and role in ('ADMIN', 'SUPER_ADMIN')
  ) then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_admin_id <> auth.uid() then
    raise exception 'ADMIN_ID_MISMATCH';
  end if;

  select * into v_topup from topups where id = p_topup_id for update;

  if not found then
    raise exception 'TOPUP_NOT_FOUND';
  end if;

  if v_topup.status <> 'PENDING' and v_topup.status <> 'VERIFYING' then
    raise exception 'TOPUP_ALREADY_PROCESSED';
  end if;

  select * into v_wallet from wallets where user_id = v_topup.user_id for update;

  update wallets
    set balance = balance + v_topup.amount, updated_at = now()
    where id = v_wallet.id;

  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_wallet.id, 'TOPUP', v_topup.amount, v_wallet.balance, v_wallet.balance + v_topup.amount, 'topup', v_topup.id, 'Top up disetujui');

  update topups
    set status = 'APPROVED', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    where id = p_topup_id;

  insert into audit_logs (actor_id, action, target_type, target_id)
  values (p_admin_id, 'topup.approve', 'topup', p_topup_id);
end;
$$;

-- =========================================================
-- FUNGSI ATOMIC: CREATE PAYMENT ORDER
-- Membuat order untuk pembayaran gateway tanpa menyentuh saldo wallet.
-- Harga diambil langsung dari database.
-- =========================================================
-- =========================================================
-- FUNGSI ATOMIC: CHECKOUT
-- Membuat order + mengurangi saldo dalam satu transaksi.
-- Harga produk diambil dari database (tidak percaya client).
-- p_items: jsonb array of {"product_id": "...", "quantity": n}
-- =========================================================
create function public.checkout(
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
begin
  -- SECURITY DEFINER tetap wajib memastikan checkout hanya untuk user yang login.
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_user_id <> auth.uid() then
    raise exception 'USER_ID_MISMATCH';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'INVALID_ITEMS';
  end if;

  -- Idempotency: jika sudah ada order dengan key ini, kembalikan order itu
  select id into v_order_id from orders where idempotency_key = p_idempotency_key;
  if found then
    return v_order_id;
  end if;

  select * into v_wallet from wallets where user_id = p_user_id for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  v_order_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6);

  insert into orders (order_number, user_id, total_amount, status, idempotency_key)
  values (v_order_number, p_user_id, 0, 'PENDING', p_idempotency_key)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products
      where id = (v_item->>'product_id')::uuid and is_active = true
      for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND_OR_INACTIVE';
    end if;

    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then
      raise exception 'INVALID_ITEM';
    end if;

    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_QUANTITY';
    end if;

    v_subtotal := v_product.price * (v_item->>'quantity')::int;
    v_total := v_total + v_subtotal;

    insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::int, v_subtotal);
  end loop;

  if v_wallet.balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update wallets set balance = balance - v_total, updated_at = now() where id = v_wallet.id;

  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_wallet.id, 'PURCHASE', -v_total, v_wallet.balance, v_wallet.balance - v_total, 'order', v_order_id, 'Pembelian produk');

  -- Produk digital langsung selesai setelah saldo berhasil dipotong;
  -- produk/jasa non-digital tetap PROCESSING untuk dikerjakan admin.
  if not exists (
    select 1 from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = v_order_id and coalesce(p.product_type, 'digital') <> 'digital'
  ) then
    update orders set total_amount = v_total, status = 'COMPLETED', updated_at = now() where id = v_order_id;
  else
    update orders set total_amount = v_total, status = 'PROCESSING', updated_at = now() where id = v_order_id;
  end if;

  insert into audit_logs (actor_id, action, target_type, target_id)
  values (p_user_id, 'order.purchase', 'order', v_order_id);

  return v_order_id;
end;
$$;

revoke all on function public.checkout(uuid, jsonb, text) from public;
grant execute on function public.checkout(uuid, jsonb, text) to authenticated;
