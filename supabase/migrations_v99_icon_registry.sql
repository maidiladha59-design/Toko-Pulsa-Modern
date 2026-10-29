-- ============================================================
-- AIDIL STORE v99: emoji di data -> kunci ikon registry
--
-- Jalankan SETELAH migrations_v98_info_ticker.sql, dari SQL Editor Supabase
-- (dashboard) sebagai peran postgres. Isi file ini hanya menyentuh teks &
-- kolom ikon: tidak ada perubahan saldo, ledger, webhook, status transaksi,
-- routing, atau API.
--
-- Yang dilakukan:
--   1) Tabel pemetaan public.emoji_icon_map (sumber kedua yang mencerminkan
--      src/components/icons/emoji-map.ts — satu-satunya tempat emoji di kode).
--   2) Fungsi bantu public.icon_key_from_text() dan public.strip_pictographs().
--   3) Kolom ikon kunci di notification_templates dan notifications, diisi dari
--      emoji pada judul, lalu emoji dilepas dari teks judul/subtitle/pesan.
--   4) Teks bebas lain yang tampil ke pengguna (broadcast, pengumuman, teks
--      ticker di site_settings) dibersihkan dari emoji saja, bukan dari tanda
--      baca biasa.
--   5) Batas ikon info_ticker dilonggarkan: dulu hanya 4 nama, kini semua nama
--      berbentuk kunci ikon (validasi sebenarnya tetap di server lewat Zod +
--      registry).
--
-- Aman diulang (idempoten): add column if not exists, on conflict, drop
-- constraint if exists, dan update yang hanya bekerja bila ada isinya.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Peta emoji lama -> nama ikon registry
-- ------------------------------------------------------------
create table if not exists public.emoji_icon_map (
  emoji    text not null primary key,
  icon_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.emoji_icon_map enable row level security;

-- Tidak ada policy SELECT: tabel ini hanya dibaca fungsi di bawah dan oleh
-- peran postgres di SQL Editor, bukan dari PostgREST.
drop policy if exists emoji_icon_map_read on public.emoji_icon_map;

insert into public.emoji_icon_map (emoji, icon_key) values
  ('📱', 'pulsa'),
  ('🌐', 'data'),
  ('🎮', 'game'),
  ('💳', 'card'),
  ('⚡', 'bolt'),
  ('🎫', 'voucher'),
  ('▶', 'streaming'),
  ('📺', 'tv'),
  ('🔥', 'gas'),
  ('📣', 'megaphone'),
  ('📢', 'megaphone'),
  ('🌀', 'ticker'),
  ('🔔', 'bell'),
  ('⭐', 'star_fill'),
  ('★', 'star_fill'),
  ('☆', 'star'),
  ('🏆', 'trophy'),
  ('🥇', 'trophy'),
  ('🥈', 'medal'),
  ('🥉', 'medal'),
  ('👑', 'crown'),
  ('🎯', 'target'),
  ('🧾', 'receipt'),
  ('🛍', 'bag'),
  ('🛒', 'bag'),
  ('📦', 'box'),
  ('💰', 'wallet'),
  ('🪙', 'coin'),
  ('💵', 'banknote'),
  ('💸', 'money_send'),
  ('🔁', 'transfer'),
  ('↩', 'undo'),
  ('🏦', 'bank'),
  ('🧮', 'calculator'),
  ('🎚', 'sliders'),
  ('⚙', 'settings'),
  ('🛠', 'tools'),
  ('🚀', 'rocket'),
  ('🧩', 'puzzle'),
  ('🗂', 'office'),
  ('📊', 'chart_bar'),
  ('📈', 'chart_line'),
  ('💹', 'chart_line'),
  ('🩺', 'activity'),
  ('📟', 'terminal'),
  ('🛡', 'shield'),
  ('📡', 'signal'),
  ('📶', 'signal_off'),
  ('🔐', 'lock'),
  ('🔒', 'lock'),
  ('🔑', 'key'),
  ('🚫', 'ban'),
  ('🔌', 'plug'),
  ('🔗', 'link'),
  ('♻', 'refresh'),
  ('🔄', 'refresh'),
  ('⬇', 'download'),
  ('📥', 'inbox'),
  ('📤', 'send'),
  ('🖨', 'printer'),
  ('📷', 'camera'),
  ('🖼', 'image'),
  ('📄', 'doc'),
  ('📋', 'clipboard'),
  ('📎', 'paperclip'),
  ('🏷', 'tag'),
  ('❓', 'help'),
  ('🎟', 'ticket'),
  ('🎁', 'gift'),
  ('🎉', 'party'),
  ('🥳', 'party'),
  ('✨', 'sparkle'),
  ('⏳', 'hourglass'),
  ('⌛', 'hourglass'),
  ('⏰', 'alarm'),
  ('⏱', 'timer'),
  ('🕐', 'timer'),
  ('⚠', 'warning'),
  ('❌', 'close_circle'),
  ('✅', 'check_circle'),
  ('✓', 'check'),
  ('✔', 'check'),
  ('✕', 'close'),
  ('✖', 'close'),
  ('✗', 'close'),
  ('☀', 'sun'),
  ('🌙', 'moon'),
  ('🖥', 'monitor'),
  ('🙂', 'user'),
  ('👤', 'user'),
  ('👥', 'users'),
  ('🚪', 'logout'),
  ('🏠', 'home'),
  ('🏢', 'building'),
  ('🏨', 'hotel'),
  ('🏥', 'hospital'),
  ('💧', 'water'),
  ('🚗', 'car'),
  ('📖', 'book'),
  ('💬', 'chat'),
  ('🔍', 'search'),
  ('🔎', 'search'),
  ('🪪', 'id_card'),
  ('☎', 'phone'),
  ('📲', 'sim_card'),
  ('⚖', 'scales'),
  ('✏', 'edit'),
  ('♥', 'heart'),
  ('❤', 'heart'),
  ('👋', 'default'),
  ('💡', 'info'),
  ('⚔', 'game'),
  ('◀', 'chevron_left'),
  ('›', 'chevron_right'),
  ('‹', 'chevron_left'),
  ('▸', 'chevron_right'),
  ('▾', 'chevron_down'),
  ('▪', 'dot'),
  ('▫', 'dot'),
  ('•', 'dot'),
  ('→', 'arrow_right'),
  ('←', 'arrow_left'),
  ('↑', 'arrow_up'),
  ('↓', 'arrow_down'),
  ('↔', 'swap')
on conflict (emoji) do update
  set icon_key = excluded.icon_key,
      updated_at = now();

-- ------------------------------------------------------------
-- 2) Fungsi bantu
-- ------------------------------------------------------------

-- Kunci ikon untuk emoji pertama yang dikenali dalam sebuah teks; NULL bila tidak ada.
create or replace function public.icon_key_from_text(p_input text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.icon_key
    from public.emoji_icon_map m
   where position(m.emoji in coalesce(p_input, '')) > 0
   order by position(m.emoji in coalesce(p_input, '')), m.emoji
   limit 1;
$$;

-- Buang piktograf (emoji) dari teks bebas, rapikan spasi ganda, pertahankan
-- tanda baca biasa. Panah (→ ← ↑ ↓) TIDAK dibuang agar teks seperti
-- "Rp100.000 → Rp50.000" tetap terbaca. Bila hasilnya kosong, teks asal
-- dipertahankan supaya tidak ada pesan yang hilang.
create or replace function public.strip_pictographs(p_input text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when cleaned.value = '' then coalesce(p_input, '')
    else cleaned.value
  end
    from (
      select btrim(
               regexp_replace(
                 regexp_replace(
                   coalesce(p_input, ''),
                   '[\U0001F000-\U0001FAFF\U0001F1E6-\U0001F1FF\U00002600-\U000027BF\U00002B00-\U00002BFF\U000025A0-\U000025FF\U0000FE0F\U0000200D]',
                   '',
                   'g'
                 ),
                 ' {2,}',
                 ' ',
                 'g'
               )
             ) as value
    ) cleaned;
$$;

-- ------------------------------------------------------------
-- 3) notification_templates: kolom kunci ikon + backfill + bersihkan emoji
-- ------------------------------------------------------------
alter table public.notification_templates
  add column if not exists icon text not null default 'bell';

alter table public.notification_templates
  drop constraint if exists notification_templates_icon_key;

alter table public.notification_templates
  add constraint notification_templates_icon_key check (icon ~ '^[a-z][a-z0-9_]{1,23}$');

-- Isi dari emoji yang sedang ada di judul (dikerjakan sebelum penghapusan).
update public.notification_templates t
   set icon = public.icon_key_from_text(t.title)
 where public.icon_key_from_text(t.title) is not null;

-- Template tanpa emoji tetap dapat kunci yang masuk akal per jenis peristiwa.
update public.notification_templates
   set icon = case
         when event_key like 'TOPUP_%'      then 'wallet'
         when event_key like 'TRANSACTION_%' then 'receipt'
         when event_key like 'TRANSFER_%'    then 'money_send'
         when event_key like 'SPLITBILL_%'   then 'receipt'
         when event_key like 'RANKING_%'     then 'trophy'
         when event_key like 'KYC_%'         then 'id_card'
         when event_key = 'SECURITY_LOGIN'   then 'shield'
         when event_key = 'PROMOTION'        then 'ticket'
         else 'megaphone'
       end
 where icon = 'bell';

update public.notification_templates
   set title    = public.strip_pictographs(title),
       subtitle = public.strip_pictographs(subtitle),
       message  = public.strip_pictographs(message),
       updated_at = now()
 where title    <> public.strip_pictographs(title)
    or subtitle <> public.strip_pictographs(subtitle)
    or message  <> public.strip_pictographs(message);

-- ------------------------------------------------------------
-- 4) notifications: kolom kunci ikon + backfill baris lama + bersihkan teks
-- ------------------------------------------------------------
alter table public.notifications
  add column if not exists icon text not null default 'bell';

alter table public.notifications
  drop constraint if exists notifications_icon_key;

alter table public.notifications
  add constraint notifications_icon_key check (icon ~ '^[a-z][a-z0-9_]{1,23}$');

update public.notifications n
   set icon = public.icon_key_from_text(n.title)
 where public.icon_key_from_text(n.title) is not null;

update public.notifications
   set title    = public.strip_pictographs(title),
       subtitle = public.strip_pictographs(coalesce(subtitle, '')),
       message  = public.strip_pictographs(message)
 where title    <> public.strip_pictographs(title)
    or coalesce(subtitle, '') <> public.strip_pictographs(coalesce(subtitle, ''))
    or message  <> public.strip_pictographs(message);

-- ------------------------------------------------------------
-- 5) Teks bebas lain yang tampil ke pengguna
-- ------------------------------------------------------------
update public.notification_broadcasts
   set title    = public.strip_pictographs(title),
       subtitle = public.strip_pictographs(coalesce(subtitle, '')),
       message  = public.strip_pictographs(message)
 where title    <> public.strip_pictographs(title)
    or coalesce(subtitle, '') <> public.strip_pictographs(coalesce(subtitle, ''))
    or message  <> public.strip_pictographs(message);

update public.site_announcements
   set message = public.strip_pictographs(message)
 where message <> public.strip_pictographs(message);

-- Teks pengaturan info berjalan (satu-satunya teks bebas di site_settings).
update public.site_settings
   set value = jsonb_set(value, '{text}', to_jsonb(public.strip_pictographs(value ->> 'text')))
 where key = 'info_ticker'
   and coalesce(value ->> 'text', '') <> public.strip_pictographs(coalesce(value ->> 'text', ''));

-- ------------------------------------------------------------
-- 6) Batas ikon info_ticker: semua kunci ikon, bukan 4 nama saja
-- ------------------------------------------------------------
-- Validasi sebenarnya ada di server (src/lib/info-ticker.ts membaca registry),
-- cek ini hanya pengaman bentuk data: kunci ikon selalu huruf kecil dan
-- underline, atau 'none'.
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
      and coalesce(value ->> 'icon', 'megaphone') ~ '^(none|[a-z][a-z0-9_]{1,23})$'
    )
  );

-- Nilai ikon lama yang berupa emoji (kalau ada) dipetakan ke kunci ikon.
update public.site_settings
   set value = jsonb_set(value, '{icon}', to_jsonb(coalesce(public.icon_key_from_text(value ->> 'icon'), 'megaphone')))
 where key = 'info_ticker'
   and coalesce(value ->> 'icon', '') !~ '^(none|[a-z][a-z0-9_]{1,23})$';

-- ------------------------------------------------------------
-- 7) Verifikasi setelah menjalankan
-- ------------------------------------------------------------
-- select event_key, icon, title from public.notification_templates order by event_key;
-- select title, icon, count(*) from public.notifications group by 1, 2 order by 3 desc limit 20;
-- select emoji, icon_key from public.emoji_icon_map order by icon_key;
-- select value ->> 'icon' as icon, left(value ->> 'text', 80) as text
--   from public.site_settings where key = 'info_ticker';
