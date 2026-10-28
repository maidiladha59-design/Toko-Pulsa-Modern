-- AIDIL STORE v97: foto profil (avatar) yang bisa dipilih pengguna.
-- Jalankan setelah v94.
--
--   1) Tabel public.avatars = koleksi avatar toko (aktif/tidak, urutan, label).
--   2) Kolom public.profiles.avatar_id (nullable, ON DELETE SET NULL sehingga
--      pengguna otomatis kembali ke avatar default bila avatar dihapus admin).
--   3) Bucket storage "avatars" (public read, tulis hanya admin/service role).
--   4) RPC user_set_avatar: satu-satunya jalur tulis pengguna ke kolom avatar,
--      dengan pemeriksaan auth.uid() + avatar harus ada & aktif.
--   5) Seed baris avatar default (gambar maskot di /avatars/default.png) yang
--      dilindungi trigger dari delete/update.
--
-- Tidak ada perubahan pada ledger saldo, top up, order, webhook, atau PIN.

-- =========================================================
-- 1) Tabel avatars
-- =========================================================
create table if not exists public.avatars (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  label text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint avatars_image_url_format
    check (image_url like 'https://%' or image_url like '/%'),
  constraint avatars_label_length check (label is null or char_length(btrim(label)) <= 60)
);

create index if not exists avatars_active_order_idx
  on public.avatars (is_active, sort_order, created_at);

-- Hanya boleh ada satu avatar default.
create unique index if not exists avatars_single_default_idx
  on public.avatars (id) where is_default;

alter table public.avatars enable row level security;

-- Pelanggan hanya melihat avatar aktif (dipakai pemilih foto profil).
drop policy if exists "avatars_select_active" on public.avatars;
create policy "avatars_select_active" on public.avatars
  for select to authenticated using (is_active = true);

-- Tulis langsung dari klien tidak pernah diizinkan; panel admin memakai
-- service role (bypass RLS) dengan pemeriksaan role di server, dan pengguna
-- memakai RPC user_set_avatar.
revoke all on public.avatars from public, anon;
grant select on public.avatars to anon, authenticated;

comment on table public.avatars is
  'Koleksi foto profil toko; dipilih pengguna lewat RPC, dikelola panel admin.';

-- =========================================================
-- 2) Kolom avatar_id pada profiles
-- =========================================================
alter table public.profiles
  add column if not exists avatar_id uuid references public.avatars(id) on delete set null;

create index if not exists profiles_avatar_id_idx
  on public.profiles (avatar_id) where avatar_id is not null;

comment on column public.profiles.avatar_id is
  'Foto profil pilihan pengguna; null = avatar default toko.';

-- =========================================================
-- 3) Bucket storage avatars
-- =========================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatars_storage_public_read" on storage.objects;
create policy "avatars_storage_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_storage_admin_insert" on storage.objects;
create policy "avatars_storage_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_admin_or_staff());

drop policy if exists "avatars_storage_admin_delete" on storage.objects;
create policy "avatars_storage_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin_or_staff());

-- =========================================================
-- 4) Avatar default (maskot toko, file di public/avatars/default.png)
-- =========================================================
insert into public.avatars (id, image_url, label, is_active, is_default, sort_order)
values ('00000000-0000-0000-0000-000000000097', '/avatars/default.png', 'Default Toko', true, true, 0)
on conflict (id) do update
  set image_url = excluded.image_url,
      label = excluded.label,
      is_active = true,
      is_default = true,
      sort_order = 0;

-- Avatar default tidak boleh dihapus, dinonaktifkan, atau diganti gambarnya.
create or replace function public.protect_default_avatar()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_default then
      raise exception 'DEFAULT_AVATAR_PROTECTED';
    end if;
    return old;
  end if;

  if old.is_default then
    if new.is_default is distinct from old.is_default
       or new.is_active is distinct from old.is_active
       or new.image_url is distinct from old.image_url then
      raise exception 'DEFAULT_AVATAR_PROTECTED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists avatars_protect_default on public.avatars;
create trigger avatars_protect_default
  before update or delete on public.avatars
  for each row execute procedure public.protect_default_avatar();

-- =========================================================
-- 5) RPC pilih avatar (pengguna)
-- =========================================================
create or replace function public.user_set_avatar(p_avatar_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_uid uuid;
  v_url text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_avatar_id is not null then
    select image_url into v_url
      from public.avatars
     where id = p_avatar_id and is_active = true;
    if not found then
      raise exception 'AVATAR_NOT_AVAILABLE';
    end if;
  else
    select image_url into v_url
      from public.avatars
     where is_default = true
     limit 1;
    if v_url is null then
      v_url := '/avatars/default.png';
    end if;
  end if;

  update public.profiles
     set avatar_id = p_avatar_id,
         updated_at = now()
   where id = v_uid;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'ok', true,
    'avatar_id', p_avatar_id,
    'image_url', v_url
  );
end;
$$;

revoke all on function public.user_set_avatar(uuid) from public, anon;
grant execute on function public.user_set_avatar(uuid) to authenticated, service_role;
