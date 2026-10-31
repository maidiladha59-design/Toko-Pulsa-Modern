-- AIDIL STORE v100 PRODUCT IMAGES
-- Tabel gambar produk yang TERPISAH dari baris produk hasil sinkronisasi supplier.
-- Sync hanya meng-upsert kolom katalog (name/slug/price/...), sehingga gambar di
-- sini tidak pernah tertimpa atau terhapus. Prioritas tampilan:
--   1) product_images.image_url (gambar khusus produk)
--   2) products.thumbnail_url (gambar lama, tetap dibaca sebagai fallback)
--   3) brand_media.logo_url (gambar brand/grup)
--   4) category_media.icon_url (gambar kategori)
--   5) ikon default di UI
-- Gambar brand & kategori memakai tabel yang sudah ada (v77 / v36) agar tidak
-- ada duplikasi data. Hanya URL publik (https) yang disimpan.

create table if not exists public.product_images (
  product_id uuid primary key references public.products(id) on delete cascade,
  image_url text not null check (image_url like 'https://%'),
  alt_text text check (alt_text is null or char_length(alt_text) <= 160),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_images_updated_at on public.product_images (updated_at desc);

alter table public.product_images enable row level security;

drop policy if exists "product_images_select_all" on public.product_images;
create policy "product_images_select_all" on public.product_images
  for select using (true);

drop policy if exists "product_images_admin_write" on public.product_images;
create policy "product_images_admin_write" on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.product_images from public, anon, authenticated;
grant select on public.product_images to anon, authenticated;

-- Admin menulis lewat API server (service role), jadi tidak perlu grant tulis
-- untuk authenticated. Tidak ada perubahan pada tabel/bucket lain.
