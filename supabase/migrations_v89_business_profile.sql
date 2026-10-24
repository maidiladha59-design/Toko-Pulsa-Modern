-- AIDIL STORE v89: identitas pelaku usaha dinamis.
-- Jalankan setelah v88.
--
--   1) Tabel single-row public.business_profile (dibaca publik).
--   2) Bucket storage business-assets (public read) untuk logo & dokumen legal.
--   3) RPC admin_update_business_profile: satu-satunya jalur tulis, dengan
--      pemeriksaan role di dalam database + audit_logs.
--
-- Catatan: dokumen legal tetap tidak ditautkan di halaman publik selama
-- show_legal_document_publicly = false. Bucket dibuat public read sesuai
-- kebutuhan logo; URL file memakai UUID acak sehingga tidak mudah ditebak.

-- =========================================================
-- 1) Tabel business_profile
-- =========================================================
create table if not exists public.business_profile (
  id boolean primary key default true check (id),
  business_name text not null default '',
  owner_name text not null default '',
  business_address text not null default '',
  business_phone text not null default '',
  business_email text not null default '',
  nib_number text not null default '',
  pse_status text not null default 'BELUM_TERDAFTAR',
  pse_registration_number text not null default '',
  logo_url text,
  legal_document_url text,
  show_legal_document_publicly boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint business_profile_pse_status_check
    check (pse_status in ('BELUM_TERDAFTAR', 'DALAM_PROSES', 'TERDAFTAR')),
  constraint business_profile_pse_number_check
    check (pse_status <> 'TERDAFTAR' or btrim(pse_registration_number) <> ''),
  constraint business_profile_logo_url_check
    check (logo_url is null or logo_url like 'https://%'),
  constraint business_profile_legal_url_check
    check (legal_document_url is null or legal_document_url like 'https://%')
);

insert into public.business_profile (id) values (true)
on conflict (id) do nothing;

alter table public.business_profile enable row level security;

drop policy if exists "business_profile_public_read" on public.business_profile;
create policy "business_profile_public_read" on public.business_profile
  for select to anon, authenticated using (id = true);

-- Tidak ada policy insert/update/delete: penulisan hanya lewat RPC security definer.
revoke all on public.business_profile from public, anon, authenticated;
grant select on public.business_profile to anon, authenticated;

comment on table public.business_profile is
  'Single-row identitas pelaku usaha AIDIL STORE; dibaca publik, ditulis lewat RPC admin.';

-- =========================================================
-- 2) Storage bucket business-assets
-- =========================================================
insert into storage.buckets (id, name, public)
values ('business-assets', 'business-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "business_assets_public_read" on storage.objects;
create policy "business_assets_public_read" on storage.objects
  for select using (bucket_id = 'business-assets');

-- Upload dari API memakai service role (bypass RLS). Policy tulis ini menjaga
-- agar klien admin yang memakai session biasa tetap tidak bisa menulis langsung.
drop policy if exists "business_assets_admin_insert" on storage.objects;
create policy "business_assets_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'business-assets' and public.is_admin_or_staff());

drop policy if exists "business_assets_admin_update" on storage.objects;
create policy "business_assets_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'business-assets' and public.is_admin_or_staff())
  with check (bucket_id = 'business-assets' and public.is_admin_or_staff());

drop policy if exists "business_assets_admin_delete" on storage.objects;
create policy "business_assets_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'business-assets' and public.is_admin_or_staff());

-- =========================================================
-- 3) RPC simpan profil (role check + audit)
-- =========================================================
create or replace function public.admin_update_business_profile(
  p_admin_id uuid,
  p_data jsonb
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_role text;
  v_before public.business_profile%rowtype;
  v_after public.business_profile%rowtype;
  v_name text;
  v_owner text;
  v_address text;
  v_phone text;
  v_email text;
  v_nib text;
  v_pse_status text;
  v_pse_number text;
  v_logo text;
  v_legal text;
  v_public boolean;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_admin_id is null or p_admin_id <> auth.uid() then
    raise exception 'ADMIN_MISMATCH';
  end if;

  select role into v_role from public.profiles where id = p_admin_id;
  if v_role is null or v_role not in ('SUPER_ADMIN', 'ADMIN', 'STAFF') then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'INVALID_DATA';
  end if;

  v_name := btrim(coalesce(p_data->>'business_name', ''));
  v_owner := btrim(coalesce(p_data->>'owner_name', ''));
  v_address := btrim(coalesce(p_data->>'business_address', ''));
  v_phone := btrim(coalesce(p_data->>'business_phone', ''));
  v_email := btrim(coalesce(p_data->>'business_email', ''));
  v_nib := btrim(coalesce(p_data->>'nib_number', ''));
  v_pse_status := upper(btrim(coalesce(p_data->>'pse_status', 'BELUM_TERDAFTAR')));
  v_pse_number := btrim(coalesce(p_data->>'pse_registration_number', ''));
  v_logo := btrim(coalesce(p_data->>'logo_url', ''));
  v_legal := btrim(coalesce(p_data->>'legal_document_url', ''));
  v_public := lower(btrim(coalesce(p_data->>'show_legal_document_publicly', 'false')))
    in ('true', '1', 'on', 'yes');

  if char_length(v_name) < 2 then
    raise exception 'BUSINESS_NAME_REQUIRED';
  end if;
  if char_length(v_name) > 160 then
    raise exception 'BUSINESS_NAME_TOO_LONG';
  end if;
  if char_length(v_owner) < 2 then
    raise exception 'OWNER_NAME_REQUIRED';
  end if;
  if char_length(v_owner) > 160 then
    raise exception 'OWNER_NAME_TOO_LONG';
  end if;
  if char_length(v_address) < 5 then
    raise exception 'ADDRESS_REQUIRED';
  end if;
  if char_length(v_address) > 500 then
    raise exception 'ADDRESS_TOO_LONG';
  end if;
  if v_phone <> '' and v_phone !~ '^[0-9+() -]{6,40}$' then
    raise exception 'INVALID_PHONE';
  end if;
  if v_email <> '' and v_email !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if char_length(v_nib) > 60 then
    raise exception 'NIB_TOO_LONG';
  end if;
  if v_pse_status not in ('BELUM_TERDAFTAR', 'DALAM_PROSES', 'TERDAFTAR') then
    raise exception 'INVALID_PSE_STATUS';
  end if;
  if v_pse_status = 'TERDAFTAR' and v_pse_number = '' then
    raise exception 'PSE_NUMBER_REQUIRED';
  end if;
  if v_pse_status <> 'TERDAFTAR' then
    v_pse_number := '';
  end if;
  if char_length(v_pse_number) > 80 then
    raise exception 'PSE_NUMBER_TOO_LONG';
  end if;
  if v_logo <> '' and v_logo not like 'https://%' then
    raise exception 'INVALID_LOGO_URL';
  end if;
  if v_legal <> '' and v_legal not like 'https://%' then
    raise exception 'INVALID_LEGAL_DOCUMENT_URL';
  end if;
  if char_length(v_logo) > 1000 or char_length(v_legal) > 1000 then
    raise exception 'URL_TOO_LONG';
  end if;
  if v_public and v_legal = '' then
    raise exception 'LEGAL_DOCUMENT_REQUIRED';
  end if;

  select * into v_before from public.business_profile where id = true for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  update public.business_profile
     set business_name = v_name,
         owner_name = v_owner,
         business_address = v_address,
         business_phone = v_phone,
         business_email = v_email,
         nib_number = v_nib,
         pse_status = v_pse_status,
         pse_registration_number = v_pse_number,
         logo_url = nullif(v_logo, ''),
         legal_document_url = nullif(v_legal, ''),
         show_legal_document_publicly = v_public,
         updated_at = now(),
         updated_by = p_admin_id
   where id = true
  returning * into v_after;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    p_admin_id,
    'business_profile.update',
    'business_profile',
    null,
    jsonb_build_object(
      'business_name', v_name,
      'owner_name', v_owner,
      'pse_status', v_pse_status,
      'previous_pse_status', v_before.pse_status,
      'nib_present', v_nib <> '',
      'logo_present', v_logo <> '',
      'legal_document_present', v_legal <> '',
      'show_legal_document_publicly', v_public
    )
  );

  return jsonb_build_object('ok', true, 'profile', to_jsonb(v_after));
end;
$$;

revoke all on function public.admin_update_business_profile(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_business_profile(uuid, jsonb) to authenticated, service_role;
