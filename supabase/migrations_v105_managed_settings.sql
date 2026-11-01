-- AIDIL STORE v105: fondasi "Pengaturan Terkelola".
-- Jalankan setelah v100 (dan v98 yang membuat public.site_settings).
--
--   1) site_settings tetap satu tabel key/value. Kolom `value` adalah nilai
--      yang SUDAH terbit (published), `draft` menyimpan perubahan yang belum
--      diterbitkan, dan `version` naik hanya saat terbit.
--   2) site_settings_history menyimpan setiap versi terbit + aksi pemulihan.
--   3) Semua penulisan lewat RPC dengan pemeriksaan versi (optimistic lock):
--      bila dua admin mengedit bersamaan, penulis kedua ditolak dengan
--      SETTING_VERSION_CONFLICT — tidak ada overwrite diam-diam.
--   4) Tidak ada policy tulis untuk anon/authenticated. RPC hanya boleh
--      dieksekusi service_role; API memeriksa role + permission di server.
--
-- Tidak menyentuh ledger saldo, top up, order, webhook, PIN, atau tabel
-- transaksi mana pun.

-- =========================================================
-- 1) Kolom draf & versi pada site_settings
-- =========================================================
alter table public.site_settings
  add column if not exists draft jsonb,
  add column if not exists version integer not null default 1,
  add column if not exists draft_updated_at timestamptz,
  add column if not exists draft_updated_by uuid references auth.users(id) on delete set null;

alter table public.site_settings
  drop constraint if exists site_settings_draft_object;
alter table public.site_settings
  add constraint site_settings_draft_object check (draft is null or jsonb_typeof(draft) = 'object');

alter table public.site_settings
  drop constraint if exists site_settings_version_positive;
alter table public.site_settings
  add constraint site_settings_version_positive check (version > 0);

comment on column public.site_settings.draft is
  'Perubahan yang belum diterbitkan. Null = tidak ada draf.';
comment on column public.site_settings.version is
  'Naik satu setiap terbit. Dipakai sebagai token konflik antar-admin.';
comment on column public.site_settings.draft_updated_by is
  'Admin terakhir yang menyimpan draf.';

-- =========================================================
-- 2) Riwayat versi
-- =========================================================
create table if not exists public.site_settings_history (
  id bigint generated always as identity primary key,
  key text not null references public.site_settings(key) on delete cascade,
  value jsonb not null,
  version integer not null check (version > 0),
  action text not null check (action in ('publish', 'restore')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists site_settings_history_key_created_idx
  on public.site_settings_history(key, created_at desc);

alter table public.site_settings_history enable row level security;

-- Riwayat hanya dibaca API admin lewat service role.
revoke all on public.site_settings_history from public, anon, authenticated;

comment on table public.site_settings_history is
  'Riwayat versi pengaturan terkelola. Hanya service role yang menulis/membaca.';

-- =========================================================
-- 3) RPC: simpan draf (optimistic lock)
-- =========================================================
create or replace function public.save_site_setting_draft(
  p_key text,
  p_value jsonb,
  p_base_version integer,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.site_settings%rowtype;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'SETTING_VALUE_INVALID';
  end if;
  if p_base_version is null or p_base_version < 0 then
    raise exception 'SETTING_VERSION_INVALID';
  end if;

  select * into v_row from public.site_settings where key = p_key for update;
  if not found then
    raise exception 'SETTING_NOT_FOUND';
  end if;
  if v_row.version <> p_base_version then
    raise exception 'SETTING_VERSION_CONFLICT';
  end if;

  update public.site_settings
     set draft = p_value,
         draft_updated_at = now(),
         draft_updated_by = p_actor
   where key = p_key
   returning * into v_row;

  return jsonb_build_object(
    'key', v_row.key,
    'version', v_row.version,
    'draft', v_row.draft,
    'draft_updated_at', v_row.draft_updated_at,
    'draft_updated_by', v_row.draft_updated_by
  );
end;
$$;

-- =========================================================
-- 4) RPC: terbitkan (history + version + nilai publik, satu transaksi)
-- =========================================================
create or replace function public.publish_site_setting(
  p_key text,
  p_value jsonb,
  p_base_version integer,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.site_settings%rowtype;
  v_next integer;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'SETTING_VALUE_INVALID';
  end if;
  if p_base_version is null or p_base_version < 0 then
    raise exception 'SETTING_VERSION_INVALID';
  end if;

  select * into v_row from public.site_settings where key = p_key for update;
  if not found then
    raise exception 'SETTING_NOT_FOUND';
  end if;
  if v_row.version <> p_base_version then
    raise exception 'SETTING_VERSION_CONFLICT';
  end if;

  v_next := v_row.version + 1;

  insert into public.site_settings_history(key, value, version, action, created_by)
  values (p_key, p_value, v_next, 'publish', p_actor);

  update public.site_settings
     set value = p_value,
         draft = null,
         draft_updated_at = null,
         draft_updated_by = null,
         version = v_next,
         updated_at = now(),
         updated_by = p_actor
   where key = p_key
   returning * into v_row;

  return jsonb_build_object(
    'key', v_row.key,
    'version', v_next,
    'published', v_row.value,
    'updated_at', v_row.updated_at,
    'updated_by', v_row.updated_by
  );
end;
$$;

-- =========================================================
-- 5) RPC: buang draf
-- =========================================================
create or replace function public.discard_site_setting_draft(
  p_key text,
  p_base_version integer,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.site_settings%rowtype;
begin
  select * into v_row from public.site_settings where key = p_key for update;
  if not found then
    raise exception 'SETTING_NOT_FOUND';
  end if;
  if v_row.version <> p_base_version then
    raise exception 'SETTING_VERSION_CONFLICT';
  end if;

  update public.site_settings
     set draft = null,
         draft_updated_at = null,
         draft_updated_by = null
   where key = p_key
   returning * into v_row;

  return jsonb_build_object('key', v_row.key, 'version', v_row.version);
end;
$$;

-- =========================================================
-- 6) RPC: pulihkan versi lama menjadi draf baru (terbit manual)
-- =========================================================
create or replace function public.restore_site_setting_version(
  p_key text,
  p_history_id bigint,
  p_base_version integer,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.site_settings%rowtype;
  v_source jsonb;
begin
  select * into v_row from public.site_settings where key = p_key for update;
  if not found then
    raise exception 'SETTING_NOT_FOUND';
  end if;
  if v_row.version <> p_base_version then
    raise exception 'SETTING_VERSION_CONFLICT';
  end if;

  select value into v_source
    from public.site_settings_history
   where id = p_history_id and key = p_key;
  if v_source is null then
    raise exception 'SETTING_HISTORY_NOT_FOUND';
  end if;

  update public.site_settings
     set draft = v_source,
         draft_updated_at = now(),
         draft_updated_by = p_actor
   where key = p_key
   returning * into v_row;

  insert into public.site_settings_history(key, value, version, action, created_by)
  values (p_key, v_source, v_row.version, 'restore', p_actor);

  return jsonb_build_object(
    'key', v_row.key,
    'version', v_row.version,
    'draft', v_row.draft,
    'restored_from', p_history_id
  );
end;
$$;

-- =========================================================
-- 7) Hak eksekusi: hanya service role
-- =========================================================
revoke all on function public.save_site_setting_draft(text, jsonb, integer, uuid) from public, anon, authenticated;
revoke all on function public.publish_site_setting(text, jsonb, integer, uuid) from public, anon, authenticated;
revoke all on function public.discard_site_setting_draft(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.restore_site_setting_version(text, bigint, integer, uuid) from public, anon, authenticated;

grant execute on function public.save_site_setting_draft(text, jsonb, integer, uuid) to service_role;
grant execute on function public.publish_site_setting(text, jsonb, integer, uuid) to service_role;
grant execute on function public.discard_site_setting_draft(text, integer, uuid) to service_role;
grant execute on function public.restore_site_setting_version(text, bigint, integer, uuid) to service_role;

-- =========================================================
-- 8) Seed aman: pastikan kunci info_ticker punya baris + versi 1.
--    Nilai lama (v98) tidak ditimpa.
-- =========================================================
insert into public.site_settings (key, value, version)
values (
  'info_ticker',
  jsonb_build_object(
    'enabled', true,
    'text', '',
    'speed', 40,
    'direction', 'left',
    'pause_on_touch', true,
    'gap', 48,
    'link_url', null,
    'icon', 'megaphone',
    'style', 'default',
    'start_at', null,
    'end_at', null
  ),
  1
)
on conflict (key) do nothing;

-- Catatan: policy baca publik site_settings_public_read (v98) sengaja hanya
-- membuka kunci yang dirender di antarmuka publik. Kunci baru yang perlu
-- dibaca tanpa login harus ditambahkan ke policy lewat migrasi tersendiri.
