-- AIDIL STORE v77 BRAND MEDIA (logo brand PPOB)
-- Run after v76.
-- Logo per brand untuk badge kelompok produk PPOB. Read-only bagi user;
-- tulis hanya ADMIN/SUPER_ADMIN (cek is_admin()). URL logo publik
-- (https), tidak menyimpan data pribadi.

create table if not exists public.brand_media (
  brand_key text primary key,
  brand_name text not null check (btrim(brand_name) <> ''),
  logo_url text not null check (logo_url like 'https://%'),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.brand_media enable row level security;

drop policy if exists "brand_media_select_all" on public.brand_media;
create policy "brand_media_select_all" on public.brand_media
  for select using (true);

drop policy if exists "brand_media_admin_write" on public.brand_media;
create policy "brand_media_admin_write" on public.brand_media
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.brand_media from public, anon, authenticated;
grant select on public.brand_media to anon, authenticated;
