-- AIDIL STORE v109: seed tema default "Biru Neon".
-- Jalankan setelah v106 (kunci theme_settings) dan v105 (draf/versi).
--
-- Sifat migrasi ini DATA-ONLY dan TIDAK PERNAH menimpa tema terbit:
--   1) Bila baris 'theme_settings' belum ada, baris dibuat dengan nilai tema
--      rekomendasi (sama persis dengan DEFAULT di src/lib/theme-settings.ts).
--   2) Bila baris sudah ada tetapi nilainya masih '{}' (belum pernah diterbitkan),
--      nilai diisi dengan tema rekomendasi.
--   3) Bila admin sudah menerbitkan tema sendiri (value berisi data), migrasi ini
--      TIDAK menyentuh apa pun. Untuk kembali ke tema rekomendasi, admin memakai
--      tombol "Terapkan tema rekomendasi" di Tema & Branding lalu menekan Terbitkan.
--
-- Tidak menyentuh skema tabel, ledger saldo, top up, order, webhook, PIN, atau
-- tabel transaksi mana pun.

insert into public.site_settings (key, value)
values (
  'theme_settings',
  '{
    "identity": {
      "shopName": "AIDIL STORE",
      "tagline": "Pulsa, data, game, e-wallet, tagihan, dan voucher dalam satu akun.",
      "logoLight": "",
      "logoDark": "",
      "faviconUrl": "",
      "ogImageUrl": ""
    },
    "light": {
      "primary": "#1573D1",
      "accent": "#7BD32A",
      "background": "#F3F6FB",
      "card": "#FFFFFF",
      "card2": "#EEF3FA",
      "border": "#E1E8F2",
      "text": "#0F172A",
      "success": "#059669",
      "warning": "#D97706",
      "danger": "#DC2626"
    },
    "dark": {
      "primary": "#3AA7FF",
      "accent": "#8CD93A",
      "background": "#070B14",
      "card": "#0F1626",
      "card2": "#151E33",
      "border": "#1E2A44",
      "text": "#F1F5F9",
      "success": "#34D399",
      "warning": "#FBBF24",
      "danger": "#F87171"
    },
    "hero": {
      "bgFrom": "#0B1220",
      "bgTo": "#123A66",
      "text": "#FFFFFF",
      "textMuted": "#FFFFFF",
      "accent": "#5CC0FF"
    },
    "heroPreset": "gelap-biru",
    "font": "inter",
    "radius": "large",
    "cardStyle": "shadow",
    "preset": "neon-blue"
  }'::jsonb
)
on conflict (key) do update
  set value = excluded.value,
      updated_at = timezone('utc', now())
  where public.site_settings.value is null
     or public.site_settings.value = '{}'::jsonb;

comment on column public.site_settings.value is
  'Isi terbit. info_ticker: src/lib/info-ticker.ts; home_settings: src/lib/home-settings.ts; theme_settings: src/lib/theme-settings.ts (default "Biru Neon" di-seed oleh v109 hanya bila belum pernah diterbitkan).';
