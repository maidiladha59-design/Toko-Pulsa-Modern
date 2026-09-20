-- =========================================================
-- MIGRATION v6 — Checkout "Upload Target" (jasa) + Fitur Bantuan
-- Jalankan SEKALI di Supabase SQL Editor setelah migration
-- sebelumnya (v5) sudah dijalankan.
--
-- Fitur yang ditambahkan:
-- 1. order_submissions -> menyimpan target/link/file yang dikirim
--    pelanggan saat checkout produk bertipe "jasa" (contoh: link
--    channel untuk jasa subscribe, file materi, dll).
-- 2. support_messages -> pesan "Butuh Bantuan" dari pelanggan yang
--    masuk ke admin, beserta balasan admin.
-- 3. Storage bucket privat "order-submissions" untuk file target.
-- =========================================================

-- =========================================================
-- ORDER SUBMISSIONS (data "Upload Target Produk")
-- =========================================================
create table if not exists order_submissions (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  order_item_id uuid not null references order_items(id) on delete cascade,
  target_text text,
  target_file_path text,
  created_at timestamptz not null default now()
);

alter table order_submissions enable row level security;

drop policy if exists "order_submissions_select_own_or_admin" on order_submissions;
create policy "order_submissions_select_own_or_admin" on order_submissions
  for select using (
    exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin()))
  );

drop policy if exists "order_submissions_insert_own" on order_submissions;
create policy "order_submissions_insert_own" on order_submissions
  for insert with check (
    exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- =========================================================
-- SUPPORT MESSAGES (fitur "Butuh Bantuan")
-- =========================================================
create table if not exists support_messages (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  subject text not null,
  message text not null,
  status text not null default 'OPEN', -- OPEN | REPLIED | CLOSED
  admin_reply text,
  replied_by uuid references profiles(id),
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table support_messages enable row level security;

drop policy if exists "support_messages_select_own_or_admin" on support_messages;
create policy "support_messages_select_own_or_admin" on support_messages
  for select using (user_id = auth.uid() or is_admin());

drop policy if exists "support_messages_insert_own" on support_messages;
create policy "support_messages_insert_own" on support_messages
  for insert with check (user_id = auth.uid());

drop policy if exists "support_messages_admin_update" on support_messages;
create policy "support_messages_admin_update" on support_messages
  for update using (is_admin());

-- =========================================================
-- STORAGE: bucket privat untuk file target jasa
-- =========================================================
insert into storage.buckets (id, name, public)
values ('order-submissions', 'order-submissions', false)
on conflict (id) do nothing;

drop policy if exists "order_submissions_files_insert_own" on storage.objects;
create policy "order_submissions_files_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'order-submissions' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "order_submissions_files_select_own_or_admin" on storage.objects;
create policy "order_submissions_files_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'order-submissions' and (
      (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()
    )
  );
