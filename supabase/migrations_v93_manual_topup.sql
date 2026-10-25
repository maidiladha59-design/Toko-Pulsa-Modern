-- AIDIL STORE v93: Top Up Manual (transfer ke akun pemilik, dikonfirmasi admin).
-- Jalankan setelah v90 (v91/v92 hanya perubahan tampilan, tanpa skema).
--
-- Isi migrasi:
--   1) manual_topup_channels  — channel pembayaran manual yang diatur admin.
--   2) manual_topup_requests  — permintaan top up + bukti transfer.
--   3) manual_topup_settings  — pengaturan single-row (aktif, min, max).
--   4) Bucket manual-topup-proofs (privat) + qris-images (public read).
--   5) RPC submit_manual_topup_request & admin_process_manual_topup.
--
-- Catatan penting:
--   - Migrasi ini TIDAK menyentuh webhook Midtrans, topups, atau alur ledger
--     gateway. Saldo hanya bertambah lewat RPC admin_process_manual_topup
--     setelah admin menyetujui bukti transfer manual.
--   - Seluruh fungsi SECURITY DEFINER memeriksa auth.uid() dan role admin di
--     dalam database, bukan hanya dari API.

-- =========================================================
-- 1) Channel pembayaran manual
-- =========================================================
create table if not exists public.manual_topup_channels (
  id uuid primary key default extensions.uuid_generate_v4(),
  channel_type text not null,
  display_name text not null,
  account_number text,
  account_holder_name text,
  qris_image_url text,
  instructions text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint manual_topup_channels_type_check
    check (channel_type in ('DANA', 'GOPAY', 'SHOPEEPAY', 'BANK_JAGO', 'BLU_BCA', 'QRIS', 'LAINNYA')),
  constraint manual_topup_channels_name_check
    check (btrim(display_name) <> ''),
  constraint manual_topup_channels_qris_image_check
    check (channel_type <> 'QRIS' or (qris_image_url is not null and btrim(qris_image_url) <> '')),
  constraint manual_topup_channels_account_check
    check (
      channel_type = 'QRIS'
      or (account_number is not null and btrim(account_number) <> '')
    )
);

create index if not exists idx_manual_topup_channels_active
  on public.manual_topup_channels (is_active, sort_order, created_at);

alter table public.manual_topup_channels enable row level security;

drop policy if exists "manual_topup_channels_select_active_or_admin" on public.manual_topup_channels;
create policy "manual_topup_channels_select_active_or_admin" on public.manual_topup_channels
  for select to authenticated
  using (is_active = true or public.is_admin());

drop policy if exists "manual_topup_channels_admin_insert" on public.manual_topup_channels;
create policy "manual_topup_channels_admin_insert" on public.manual_topup_channels
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "manual_topup_channels_admin_update" on public.manual_topup_channels;
create policy "manual_topup_channels_admin_update" on public.manual_topup_channels
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "manual_topup_channels_admin_delete" on public.manual_topup_channels;
create policy "manual_topup_channels_admin_delete" on public.manual_topup_channels
  for delete to authenticated
  using (public.is_admin());

revoke all on public.manual_topup_channels from public, anon;
grant select, insert, update, delete on public.manual_topup_channels to authenticated;
grant all on public.manual_topup_channels to service_role;

create or replace function public.touch_manual_topup_channel()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_manual_topup_channel on public.manual_topup_channels;
create trigger trg_touch_manual_topup_channel
  before update on public.manual_topup_channels
  for each row execute function public.touch_manual_topup_channel();

comment on table public.manual_topup_channels is
  'Channel pembayaran manual AIDIL STORE (DANA/GoPay/ShopeePay/Bank Jago/blu/QRIS) yang diatur admin.';

-- =========================================================
-- 2) Permintaan Top Up Manual
-- =========================================================
create table if not exists public.manual_topup_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid references public.manual_topup_channels(id) on delete set null,
  channel_type text not null,
  amount bigint not null check (amount > 0),
  proof_image_url text not null check (btrim(proof_image_url) <> ''),
  status text not null default 'PENDING',
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint manual_topup_requests_status_check
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  constraint manual_topup_requests_type_check
    check (channel_type in ('DANA', 'GOPAY', 'SHOPEEPAY', 'BANK_JAGO', 'BLU_BCA', 'QRIS', 'LAINNYA'))
);

create index if not exists idx_manual_topup_requests_user
  on public.manual_topup_requests (user_id, created_at desc);
create index if not exists idx_manual_topup_requests_status
  on public.manual_topup_requests (status, created_at asc);

alter table public.manual_topup_requests enable row level security;

drop policy if exists "manual_topup_requests_select_own_or_admin" on public.manual_topup_requests;
create policy "manual_topup_requests_select_own_or_admin" on public.manual_topup_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- User boleh membuat permintaannya sendiri; status awal wajib PENDING dan
-- tidak boleh mengisi kolom hasil review. Perubahan status hanya lewat RPC.
drop policy if exists "manual_topup_requests_insert_own" on public.manual_topup_requests;
create policy "manual_topup_requests_insert_own" on public.manual_topup_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'PENDING'
    and reviewed_by is null
    and reviewed_at is null
  );

revoke all on public.manual_topup_requests from public, anon;
grant select, insert on public.manual_topup_requests to authenticated;
grant all on public.manual_topup_requests to service_role;

comment on table public.manual_topup_requests is
  'Permintaan Top Up Manual + bukti transfer privat; disetujui/ditolak admin lewat RPC.';

-- =========================================================
-- 3) Pengaturan Top Up Manual (single row)
-- =========================================================
create table if not exists public.manual_topup_settings (
  id integer primary key default 1 check (id = 1),
  is_enabled boolean not null default true,
  min_amount bigint not null default 10000 check (min_amount > 0),
  max_amount bigint not null default 5000000 check (max_amount >= min_amount),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.manual_topup_settings (id, is_enabled, min_amount, max_amount)
values (1, true, 10000, 5000000)
on conflict (id) do nothing;

alter table public.manual_topup_settings enable row level security;

drop policy if exists "manual_topup_settings_select_authenticated" on public.manual_topup_settings;
create policy "manual_topup_settings_select_authenticated" on public.manual_topup_settings
  for select to authenticated
  using (true);

drop policy if exists "manual_topup_settings_admin_write" on public.manual_topup_settings;
create policy "manual_topup_settings_admin_write" on public.manual_topup_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.manual_topup_settings from public, anon;
grant select, insert, update on public.manual_topup_settings to authenticated;
grant all on public.manual_topup_settings to service_role;

comment on table public.manual_topup_settings is
  'Pengaturan single-row Top Up Manual: aktif/nonaktif, minimum, dan maksimum nominal.';

-- =========================================================
-- 4) Storage
-- =========================================================
-- Bukti transfer bersifat privat. API memakai service role untuk upload,
-- sedangkan user hanya boleh membaca/menghapus file di foldernya sendiri.
insert into storage.buckets (id, name, public)
values ('manual-topup-proofs', 'manual-topup-proofs', false)
on conflict (id) do update set public = false;

drop policy if exists "manual_topup_proofs_insert_own" on storage.objects;
create policy "manual_topup_proofs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'manual-topup-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(name) ~ '\.(jpe?g|png|webp)$'
  );

drop policy if exists "manual_topup_proofs_select_own_or_admin" on storage.objects;
create policy "manual_topup_proofs_select_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'manual-topup-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "manual_topup_proofs_delete_own_or_admin" on storage.objects;
create policy "manual_topup_proofs_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'manual-topup-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- Gambar QRIS publik (dibaca langsung oleh halaman Top Up). Hanya admin yang
-- boleh menulis; upload dari API memakai service role setelah cek role.
insert into storage.buckets (id, name, public)
values ('qris-images', 'qris-images', true)
on conflict (id) do update set public = true;

drop policy if exists "qris_images_public_read" on storage.objects;
create policy "qris_images_public_read" on storage.objects
  for select using (bucket_id = 'qris-images');

drop policy if exists "qris_images_admin_insert" on storage.objects;
create policy "qris_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'qris-images' and public.is_admin());

drop policy if exists "qris_images_admin_update" on storage.objects;
create policy "qris_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'qris-images' and public.is_admin())
  with check (bucket_id = 'qris-images' and public.is_admin());

drop policy if exists "qris_images_admin_delete" on storage.objects;
create policy "qris_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'qris-images' and public.is_admin());

-- =========================================================
-- 5) RPC: user mengirim permintaan Top Up Manual
-- =========================================================
create or replace function public.submit_manual_topup_request(
  p_user_id uuid,
  p_channel_id uuid,
  p_amount bigint,
  p_proof_image_url text
)
returns uuid
language plpgsql
volatile
security definer set search_path = public, extensions
as $$
declare
  v_settings public.manual_topup_settings%rowtype;
  v_channel public.manual_topup_channels%rowtype;
  v_proof text;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'USER_ID_MISMATCH';
  end if;

  perform public.assert_account_active(p_user_id);

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select * into v_settings from public.manual_topup_settings where id = 1;
  if not found or not v_settings.is_enabled then
    raise exception 'MANUAL_TOPUP_DISABLED';
  end if;
  if p_amount < v_settings.min_amount then
    raise exception 'BELOW_MIN_AMOUNT';
  end if;
  if p_amount > v_settings.max_amount then
    raise exception 'ABOVE_MAX_AMOUNT';
  end if;

  select * into v_channel
    from public.manual_topup_channels
    where id = p_channel_id and is_active = true;
  if not found then
    raise exception 'CHANNEL_NOT_AVAILABLE';
  end if;

  v_proof := btrim(coalesce(p_proof_image_url, ''));
  if v_proof = '' then
    raise exception 'PROOF_REQUIRED';
  end if;
  -- Bukti wajib berada di folder milik user di bucket privat.
  if split_part(v_proof, '/', 1) <> p_user_id::text then
    raise exception 'INVALID_PROOF_PATH';
  end if;

  insert into public.manual_topup_requests (
    user_id, channel_id, channel_type, amount, proof_image_url
  )
  values (
    p_user_id, v_channel.id, v_channel.channel_type, p_amount, v_proof
  )
  returning id into v_request_id;

  -- Notifikasi in-app untuk seluruh admin (badge permintaan baru).
  insert into public.notifications (user_id, title, message, reference_type, reference_id)
  select p.id,
         'Permintaan Top Up Manual',
         'Ada permintaan Top Up Manual sebesar Rp' ||
           to_char(p_amount, 'FM999G999G999G999') ||
           ' yang menunggu konfirmasi.',
         'manual_topup_request',
         v_request_id
    from public.profiles p
   where p.role in ('ADMIN', 'SUPER_ADMIN');

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    p_user_id,
    'manual_topup.request',
    'manual_topup_request',
    v_request_id,
    jsonb_build_object(
      'channel_id', v_channel.id,
      'channel_type', v_channel.channel_type,
      'amount', p_amount
    )
  );

  return v_request_id;
end;
$$;

revoke all on function public.submit_manual_topup_request(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.submit_manual_topup_request(uuid, uuid, bigint, text) to authenticated, service_role;

-- =========================================================
-- 6) RPC: admin menyetujui / menolak permintaan
-- =========================================================
create or replace function public.admin_process_manual_topup(
  p_admin_id uuid,
  p_request_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public, extensions
as $$
declare
  v_role text;
  v_action text;
  v_note text;
  v_request public.manual_topup_requests%rowtype;
  v_wallet public.wallets%rowtype;
  v_before bigint;
  v_after bigint;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_admin_id is null or p_admin_id <> auth.uid() then
    raise exception 'ADMIN_MISMATCH';
  end if;

  select role into v_role from public.profiles where id = p_admin_id;
  if v_role is null or v_role not in ('SUPER_ADMIN', 'ADMIN') then
    raise exception 'ADMIN_ONLY';
  end if;

  v_action := upper(btrim(coalesce(p_action, '')));
  if v_action not in ('APPROVE', 'REJECT') then
    raise exception 'INVALID_ACTION';
  end if;

  v_note := btrim(coalesce(p_note, ''));
  if v_action = 'REJECT' and char_length(v_note) < 5 then
    raise exception 'NOTE_REQUIRED';
  end if;

  -- Kunci baris permintaan: hanya satu admin yang bisa memproses.
  select * into v_request
    from public.manual_topup_requests
    where id = p_request_id
    for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'PENDING' then
    raise exception 'REQUEST_ALREADY_PROCESSED';
  end if;

  if v_action = 'REJECT' then
    update public.manual_topup_requests
       set status = 'REJECTED',
           admin_note = left(v_note, 500),
           reviewed_by = p_admin_id,
           reviewed_at = now()
     where id = v_request.id;

    insert into public.notifications (user_id, title, message, reference_type, reference_id)
    values (
      v_request.user_id,
      'Top Up Manual Ditolak',
      'Permintaan Top Up Manual sebesar Rp' ||
        to_char(v_request.amount, 'FM999G999G999G999') ||
        ' ditolak. Alasan: ' || left(v_note, 200),
      'manual_topup_request',
      v_request.id
    );

    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (
      p_admin_id,
      'manual_topup.reject',
      'manual_topup_request',
      v_request.id,
      jsonb_build_object(
        'user_id', v_request.user_id,
        'amount', v_request.amount,
        'channel_type', v_request.channel_type,
        'reason', left(v_note, 500)
      )
    );

    return jsonb_build_object(
      'ok', true,
      'status', 'REJECTED',
      'request_id', v_request.id,
      'amount', v_request.amount
    );
  end if;

  -- APPROVE: kredit wallet setelah bukti transfer disetujui admin.
  if not exists (select 1 from public.profiles where id = v_request.user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  insert into public.wallets (user_id, balance)
  values (v_request.user_id, 0)
  on conflict (user_id) do nothing;

  select * into v_wallet
    from public.wallets
    where user_id = v_request.user_id
    for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  v_before := v_wallet.balance;
  v_after := v_before + v_request.amount;

  update public.wallets
     set balance = v_after, updated_at = now()
   where id = v_wallet.id;

  insert into public.wallet_transactions (
    wallet_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description
  )
  values (
    v_wallet.id, 'TOPUP', v_request.amount, v_before, v_after,
    'manual_topup_request', v_request.id,
    'Top Up Manual disetujui admin'
  );

  update public.manual_topup_requests
     set status = 'APPROVED',
         admin_note = nullif(left(v_note, 500), ''),
         reviewed_by = p_admin_id,
         reviewed_at = now()
   where id = v_request.id;

  insert into public.notifications (user_id, title, message, reference_type, reference_id)
  values (
    v_request.user_id,
    'Top Up Berhasil',
    'Saldo kamu bertambah Rp' ||
      to_char(v_request.amount, 'FM999G999G999G999') ||
      ' dari Top Up Manual yang sudah dikonfirmasi admin.',
    'manual_topup_request',
    v_request.id
  );

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    p_admin_id,
    'manual_topup.approve',
    'manual_topup_request',
    v_request.id,
    jsonb_build_object(
      'user_id', v_request.user_id,
      'amount', v_request.amount,
      'channel_type', v_request.channel_type,
      'balance_before', v_before,
      'balance_after', v_after
    )
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'APPROVED',
    'request_id', v_request.id,
    'amount', v_request.amount,
    'balance_before', v_before,
    'balance_after', v_after
  );
end;
$$;

revoke all on function public.admin_process_manual_topup(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_process_manual_topup(uuid, uuid, text, text) to authenticated, service_role;

-- =========================================================
-- Selesai v93
-- =========================================================
