-- AIDIL STORE v110: pengaturan Navigasi Bawah toko & admin.
-- Jalankan setelah v105 (fondasi draf/terbit site_settings) dan v107
-- (policy baca publik yang diperluas).
--
--   1) Dua kunci baru di public.site_settings: bottom_nav_shop dan
--      bottom_nav_admin. Nilai awalnya '{}' sehingga kode memakai default
--      "kapsul" di src/lib/bottom-nav.ts sampai admin menerbitkan versi
--      pertama. Tidak ada data lama yang ditimpa.
--   2) Policy baca publik diperluas agar anon/authenticated bisa membaca dua
--      kunci ini (nav dirender di server pada HTML pertama). Daftar kunci
--      lama dipertahankan; 'notification_templates' tetap privat.
--   3) Tidak ada tabel/bucket/kolom baru, tidak menyentuh ledger saldo,
--      top up, order, webhook, PIN, atau tabel transaksi mana pun.
--
-- Catatan: draf, versi, riwayat, audit, dan revalidateTag memakai fondasi
-- Pengaturan Terkelola v105 yang sudah ada (tidak diubah oleh migrasi ini).

-- =========================================================
-- 1) Perluas policy baca publik
-- =========================================================
drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read" on public.site_settings
  for select to anon, authenticated
  using (
    key in (
      'info_ticker',
      'home_settings',
      'theme_settings',
      'pages_settings',
      'level_kyc_settings',
      'operator_settings',
      'bottom_nav_shop',
      'bottom_nav_admin'
    )
  );

-- =========================================================
-- 2) Seed kunci baru (default berasal dari kode, bukan dari SQL)
-- =========================================================
insert into public.site_settings (key, value)
values
  ('bottom_nav_shop', '{}'::jsonb),
  ('bottom_nav_admin', '{}'::jsonb)
on conflict (key) do nothing;

comment on column public.site_settings.value is
  'Isi terbit. info_ticker: src/lib/info-ticker.ts; home_settings: src/lib/home-settings.ts; theme_settings: src/lib/theme-settings.ts; pages_settings: src/lib/pages-settings.ts; level_kyc_settings: src/lib/level-kyc-settings.ts; notification_templates: src/lib/notification-templates.ts (privat); operator_settings: src/lib/operator-settings.ts; bottom_nav_shop & bottom_nav_admin: src/lib/bottom-nav.ts.';
