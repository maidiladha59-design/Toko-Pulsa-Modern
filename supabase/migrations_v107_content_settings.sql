-- AIDIL STORE v107: pengaturan teks & halaman, level & KYC, template
-- notifikasi, dan peta operator.
-- Jalankan setelah v105 (fondasi draf/terbit site_settings) dan v106.
--
--   1) Empat kunci baru di public.site_settings. Nilai awalnya '{}' sehingga
--      kode memakai default di src/lib/pages-settings.ts,
--      src/lib/level-kyc-settings.ts, src/lib/notification-templates.ts, dan
--      src/lib/operator-settings.ts sampai admin menerbitkan versi pertama.
--      Tidak ada data lama yang ditimpa.
--   2) Policy baca publik diperluas untuk teks & halaman, level & KYC, dan
--      peta operator. 'notification_templates' sengaja TIDAK dibaca publik;
--      hanya server (service role) yang membacanya untuk mesin notifikasi.
--   3) Tidak ada tabel baru, tidak menyentuh ledger saldo, top up, order,
--      webhook, PIN, atau tabel transaksi mana pun.
--
-- Catatan: batas KYC ditegakkan di kode server (src/lib/kyc-limits-server.ts)
-- dan template notifikasi dipakai mesin notifikasi yang sudah ada. Migrasi ini
-- hanya menyediakan tempat penyimpanan nilai terbit/draf.

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
      'operator_settings'
    )
  );

-- =========================================================
-- 2) Seed kunci baru (default berasal dari kode, bukan dari SQL)
-- =========================================================
insert into public.site_settings (key, value)
values
  ('pages_settings', '{}'::jsonb),
  ('level_kyc_settings', '{}'::jsonb),
  ('notification_templates', '{}'::jsonb),
  ('operator_settings', '{}'::jsonb)
on conflict (key) do nothing;

comment on column public.site_settings.value is
  'Isi terbit. info_ticker: src/lib/info-ticker.ts; home_settings: src/lib/home-settings.ts; theme_settings: src/lib/theme-settings.ts; pages_settings: src/lib/pages-settings.ts; level_kyc_settings: src/lib/level-kyc-settings.ts; notification_templates: src/lib/notification-templates.ts (privat); operator_settings: src/lib/operator-settings.ts.';
