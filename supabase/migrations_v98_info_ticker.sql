-- AIDIL STORE v98: pengaturan "Info Berjalan" (ticker) di hero beranda.
-- Jalankan setelah v97.
--
--   1) Tabel public.site_settings = key/value JSON (satu tabel, bukan banyak).
--   2) Record 'info_ticker' berisi teks, kecepatan, arah, jeda, gaya, jadwal.
--      Teks awal diambil dari site_announcements yang sedang aktif, jadi isi
--      kartu "Info AIDIL STORE" lama tidak hilang saat pindah ke ticker.
--   3) RLS: semua orang boleh SELECT, tidak ada jalur tulis langsung — panel
--      admin menulis lewat service role dengan pemeriksaan role di server.
--
-- Tidak ada perubahan pada ledger saldo, top up, order, webhook, PIN, atau
-- tabel transaksi mana pun.

-- =========================================================
-- 1) Tabel site_settings
-- =========================================================
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint site_settings_key_format check (key ~ '^[a-z0-9_]{2,60}$'),
  constraint site_settings_value_object check (jsonb_typeof(value) = 'object')
);

alter table public.site_settings enable row level security;

-- Pembacaan hanya untuk kunci yang memang dibutuhkan antarmuka publik.
drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read" on public.site_settings
  for select to anon, authenticated using (key in ('info_ticker'));

-- Tidak ada policy insert/update/delete: klien biasa tidak pernah bisa menulis.
revoke all on public.site_settings from public, anon, authenticated;
grant select on public.site_settings to anon, authenticated;

comment on table public.site_settings is
  'Pengaturan situs key/value (JSON). Ditulis hanya oleh panel admin lewat service role.';
comment on column public.site_settings.value is
  'Isi pengaturan; untuk kunci info_ticker lihat DEFAULT_INFO_TICKER di src/lib/info-ticker.ts.';

-- =========================================================
-- 2) Record 'info_ticker' dengan nilai default
-- =========================================================
insert into public.site_settings (key, value)
select
  'info_ticker',
  jsonb_build_object(
    'enabled', true,
    -- Teks awal = pesan info yang sedang tampil hari ini.
    'text', coalesce(
      (select nullif(btrim(a.message), '')
         from public.site_announcements a
        where a.is_active = true
        order by a.updated_at desc
        limit 1),
      'Semua transaksi digital bisa diproses langsung dari satu akun AIDIL STORE.'
    ),
    'speed', 40,
    'direction', 'left',
    'pause_on_touch', true,
    'gap', 48,
    'link_url', null,
    'icon', 'megaphone',
    'style', 'default',
    'start_at', null,
    'end_at', null
  )
on conflict (key) do nothing;

-- =========================================================
-- 3) Batas bentuk isi info_ticker (pengaman, bukan pengganti validasi server)
-- =========================================================
alter table public.site_settings
  drop constraint if exists site_settings_info_ticker_bounds;

alter table public.site_settings
  add constraint site_settings_info_ticker_bounds check (
    key <> 'info_ticker'
    or (
      char_length(btrim(coalesce(value ->> 'text', ''))) <= 300
      and coalesce((value ->> 'speed')::numeric, 40) between 10 and 120
      and coalesce((value ->> 'gap')::numeric, 48) between 16 and 160
      and coalesce(value ->> 'direction', 'left') in ('left', 'right')
      and coalesce(value ->> 'style', 'default') in ('default', 'emas', 'peringatan')
      and coalesce(value ->> 'icon', 'megaphone') in ('megaphone', 'bell', 'star', 'none')
    )
  );
