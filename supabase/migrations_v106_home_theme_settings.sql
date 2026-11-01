-- AIDIL STORE v106: pengaturan beranda + tema & branding.
-- Jalankan setelah v105 (fondasi draf/terbit site_settings) dan v100.
--
--   1) Dua kunci baru di public.site_settings: 'home_settings' dan
--      'theme_settings'. Nilai awalnya '{}' sehingga kode memakai default di
--      src/lib/home-settings.ts dan src/lib/theme-settings.ts sampai admin
--      menerbitkan versi pertama. Tidak ada data lama yang ditimpa.
--   2) Policy baca publik v98 diperluas agar halaman beranda bisa membaca
--      kedua kunci ini. Tetap hanya SELECT: tulis hanya lewat service role
--      dengan pemeriksaan role + permission di server.
--   3) Bucket storage 'settings-assets' untuk banner, logo, favicon, dan
--      gambar share. Database hanya menyimpan URL publik; tidak ada base64
--      dan tidak ada penulisan disk lokal.
--
-- Tidak menyentuh ledger saldo, top up, order, webhook, PIN, atau tabel
-- transaksi mana pun.

-- =========================================================
-- 1) Perluas policy baca publik
-- =========================================================
drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read" on public.site_settings
  for select to anon, authenticated
  using (key in ('info_ticker', 'home_settings', 'theme_settings'));

-- =========================================================
-- 2) Seed kunci baru (default berasal dari kode, bukan dari SQL)
-- =========================================================
insert into public.site_settings (key, value)
values
  ('home_settings', '{}'::jsonb),
  ('theme_settings', '{}'::jsonb)
on conflict (key) do nothing;

comment on table public.site_settings is
  'Pengaturan situs key/value (JSON). Nilai terbit di `value`, perubahan belum terbit di `draft`. Ditulis hanya oleh panel admin lewat service role.';
comment on column public.site_settings.value is
  'Isi terbit. info_ticker: src/lib/info-ticker.ts; home_settings: src/lib/home-settings.ts; theme_settings: src/lib/theme-settings.ts.';

-- =========================================================
-- 3) Bucket storage settings-assets
-- =========================================================
insert into storage.buckets (id, name, public)
values ('settings-assets', 'settings-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "settings_assets_public_read" on storage.objects;
create policy "settings_assets_public_read" on storage.objects
  for select using (bucket_id = 'settings-assets');

drop policy if exists "settings_assets_admin_insert" on storage.objects;
create policy "settings_assets_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'settings-assets' and public.is_admin_or_staff());

drop policy if exists "settings_assets_admin_delete" on storage.objects;
create policy "settings_assets_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'settings-assets' and public.is_admin_or_staff());
