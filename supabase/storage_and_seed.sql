-- =========================================================
-- STORAGE BUCKETS
-- Jalankan setelah schema.sql
-- =========================================================

insert into storage.buckets (id, name, public)
values ('topup-proofs', 'topup-proofs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('digital-products', 'digital-products', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('product-thumbnails', 'product-thumbnails', true)
on conflict (id) do nothing;

-- Hapus policy lama agar file ini aman dijalankan ulang.
DROP POLICY IF EXISTS "topup_proofs_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "topup_proofs_select_own_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "digital_products_admin_write" ON storage.objects;
DROP POLICY IF EXISTS "product_thumbnails_select_all" ON storage.objects;
DROP POLICY IF EXISTS "product_thumbnails_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_thumbnails_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "product_thumbnails_admin_delete" ON storage.objects;

-- Bukti top up: user hanya boleh upload & baca foldernya sendiri; admin boleh baca semua
create policy "topup_proofs_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'topup-proofs' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "topup_proofs_select_own_or_admin" on storage.objects
  for select using (
    bucket_id = 'topup-proofs' and (
      (storage.foldername(name))[1] = auth.uid()::text or public.is_admin()
    )
  );

-- Produk digital: privat, hanya bisa diakses lewat signed URL yang dibuat server
-- (tidak ada policy select untuk user biasa; server pakai service role / rpc).
create policy "digital_products_admin_write" on storage.objects
  for all using (bucket_id = 'digital-products' and public.is_admin())
  with check (bucket_id = 'digital-products' and public.is_admin());

-- Thumbnail produk: publik boleh baca, hanya admin boleh upload
create policy "product_thumbnails_select_all" on storage.objects
  for select using (bucket_id = 'product-thumbnails');

create policy "product_thumbnails_admin_insert" on storage.objects
  for insert with check (bucket_id = 'product-thumbnails' and public.is_admin());

create policy "product_thumbnails_admin_update" on storage.objects
  for update using (bucket_id = 'product-thumbnails' and public.is_admin())
  with check (bucket_id = 'product-thumbnails' and public.is_admin());

create policy "product_thumbnails_admin_delete" on storage.objects
  for delete using (bucket_id = 'product-thumbnails' and public.is_admin());

-- =========================================================
-- SEED DATA (demo) — jangan taruh secret/key asli di sini
-- =========================================================

insert into payment_settings (method, account_number, account_name, instructions, is_active)
values ('DANA', '081234567890', 'Aidil Store Official', 'Transfer sesuai nominal, lalu upload bukti pembayaran.', true);

insert into categories (name, slug) values
  ('Template & Dokumen Digital', 'template-dokumen-digital'),
  ('Desain Grafis', 'desain-grafis'),
  ('Template & Produk Digital', 'template-produk-digital');

insert into products (category_id, name, slug, description, price, product_type, is_active)
select id, 'Template Dokumen Profesional', 'template-dokumen-profesional', 'Template dokumen siap edit untuk kebutuhan pribadi dan bisnis.', 15000, 'digital', true
from categories where slug = 'template-dokumen-digital';

insert into products (category_id, name, slug, description, price, product_type, is_active)
select id, 'Template CV ATS-Friendly', 'template-cv-ats', 'Template CV siap pakai, format .docx & .pdf.', 15000, 'digital', true
from categories where slug = 'template-produk-digital';

-- NOTE: 1 akun admin dibuat lewat Supabase Auth (register biasa),
-- lalu jalankan manual:
-- update profiles set role = 'SUPER_ADMIN' where email = 'admin@aidilstore.com';
