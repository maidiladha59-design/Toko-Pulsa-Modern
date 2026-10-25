-- AIDIL STORE v94: Ruang Diskusi Publik (community chat) + moderasi admin.
-- Jalankan setelah v93.
--
-- Isi migrasi:
--   1) community_chat_messages — pesan publik, soft delete oleh admin.
--   2) chat_user_status       — status bisu per user (terpisah dari blokir akun).
--   3) Realtime publication untuk INSERT dan UPDATE pesan.
--   4) RPC post_community_chat_message, admin_delete_chat_message,
--      admin_set_chat_mute, dan helper nama tampilan.
--
-- Catatan penting:
--   - TIDAK ada policy INSERT/UPDATE/DELETE langsung untuk authenticated.
--     Semua penulisan wajib lewat RPC SECURITY DEFINER yang memeriksa
--     auth.uid(), role admin, status blokir akun, dan status bisu.
--   - Migrasi ini tidak menyentuh webhook Midtrans, topups, wallet, atau
--     alur transaksi yang sudah ada.

-- =========================================================
-- 1) Pesan ruang diskusi
-- =========================================================
create table if not exists public.community_chat_messages (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  is_deleted boolean not null default false,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_reason text,
  created_at timestamptz not null default now(),
  constraint community_chat_messages_length_check
    check (char_length(btrim(message)) between 1 and 1000),
  constraint community_chat_messages_deleted_check
    check (
      (is_deleted = false and deleted_by is null and deleted_reason is null)
      or is_deleted = true
    )
);

create index if not exists idx_community_chat_messages_created
  on public.community_chat_messages (created_at desc);
create index if not exists idx_community_chat_messages_user_created
  on public.community_chat_messages (user_id, created_at desc);
create index if not exists idx_community_chat_messages_deleted
  on public.community_chat_messages (is_deleted, created_at desc);

alter table public.community_chat_messages enable row level security;

-- Semua user login boleh membaca pesan aktif. Pesan terhapus hanya terlihat
-- oleh admin (dipakai untuk audit/moderasi).
drop policy if exists "community_chat_messages_select_authenticated" on public.community_chat_messages;
create policy "community_chat_messages_select_authenticated" on public.community_chat_messages
  for select to authenticated
  using (is_deleted = false or public.is_admin());

-- Sengaja tidak ada policy INSERT/UPDATE/DELETE untuk authenticated.
revoke all on public.community_chat_messages from public, anon;
grant select on public.community_chat_messages to authenticated;
grant all on public.community_chat_messages to service_role;

comment on table public.community_chat_messages is
  'Pesan Ruang Diskusi Publik AIDIL STORE. Penulisan hanya lewat RPC; soft delete oleh admin.';

-- =========================================================
-- 2) Status bisu per user
-- =========================================================
create table if not exists public.chat_user_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_muted boolean not null default false,
  muted_reason text,
  muted_by uuid references auth.users(id) on delete set null,
  muted_at timestamptz
);

create index if not exists idx_chat_user_status_muted
  on public.chat_user_status (is_muted, muted_at desc);

alter table public.chat_user_status enable row level security;

drop policy if exists "chat_user_status_select_own" on public.chat_user_status;
create policy "chat_user_status_select_own" on public.chat_user_status
  for select to authenticated
  using (user_id = auth.uid());

-- Admin membaca seluruh baris lewat API server (service role) setelah cek role.
revoke all on public.chat_user_status from public, anon;
grant select on public.chat_user_status to authenticated;
grant all on public.chat_user_status to service_role;

comment on table public.chat_user_status is
  'Status bisu Ruang Diskusi per user. Terpisah dari account_status (blokir akun global).';

-- =========================================================
-- 3) Realtime: INSERT pesan baru + UPDATE saat pesan dihapus
-- =========================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'community_chat_messages'
    ) then
      alter publication supabase_realtime add table public.community_chat_messages;
    end if;
  else
    create publication supabase_realtime for table public.community_chat_messages;
  end if;
end;
$$;

-- =========================================================
-- 4) Helper: nama tampilan untuk bubble chat
-- =========================================================
-- profiles hanya bisa dibaca pemilik/admin (RLS), jadi nama untuk ruang publik
-- diambil lewat fungsi SECURITY DEFINER yang hanya mengembalikan id + nama.
create or replace function public.community_chat_display_names(p_user_ids uuid[])
returns table (user_id uuid, display_name text)
language sql
stable
security definer set search_path = public, extensions
as $$
  -- Jangan pernah memakai bagian email sebagai nama publik.
  select p.id,
         coalesce(
           nullif(btrim(p.full_name), ''),
           'Pengguna ' || left(p.id::text, 6)
         )
    from public.profiles p
   where auth.uid() is not null
     and p.id = any(coalesce(p_user_ids, array[]::uuid[]))
     and exists (
       select 1
         from public.community_chat_messages m
        where m.user_id = p.id
     );
$$;

revoke all on function public.community_chat_display_names(uuid[]) from public, anon;
grant execute on function public.community_chat_display_names(uuid[]) to authenticated, service_role;

-- =========================================================
-- 5) RPC: user mengirim pesan
-- =========================================================
create or replace function public.post_community_chat_message(
  p_user_id uuid,
  p_message text
)
returns uuid
language plpgsql
volatile
security definer set search_path = public, extensions
as $$
declare
  v_message text;
  v_status public.chat_user_status%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'USER_ID_MISMATCH';
  end if;

  -- Blokir akun global (v88) juga berlaku di ruang diskusi.
  perform public.assert_account_active(p_user_id);

  select * into v_status
    from public.chat_user_status
   where user_id = p_user_id;
  if found and v_status.is_muted then
    raise exception 'CHAT_MUTED:%',
      coalesce(nullif(btrim(v_status.muted_reason), ''), 'Kamu dibisukan dari ruang diskusi.');
  end if;

  v_message := btrim(coalesce(p_message, ''));
  if v_message = '' then
    raise exception 'INVALID_MESSAGE';
  end if;
  if char_length(v_message) > 1000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  -- Kunci per user agar dua permintaan bersamaan tidak lolos rate limit.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if exists (
    select 1
      from public.community_chat_messages
     where user_id = p_user_id
       and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'CHAT_RATE_LIMIT';
  end if;

  insert into public.community_chat_messages (user_id, message)
  values (p_user_id, v_message)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.post_community_chat_message(uuid, text) from public, anon;
grant execute on function public.post_community_chat_message(uuid, text) to authenticated, service_role;

-- =========================================================
-- 6) RPC: admin menghapus pesan (soft delete)
-- =========================================================
create or replace function public.admin_delete_chat_message(
  p_admin_id uuid,
  p_message_id uuid,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer set search_path = public, extensions
as $$
declare
  v_role text;
  v_reason text;
  v_message public.community_chat_messages%rowtype;
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

  v_reason := nullif(left(btrim(coalesce(p_reason, '')), 500), '');

  select * into v_message
    from public.community_chat_messages
   where id = p_message_id
   for update;
  if not found then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;

  if not v_message.is_deleted then
    update public.community_chat_messages
       set is_deleted = true,
           deleted_by = p_admin_id,
           deleted_reason = v_reason
     where id = v_message.id;

    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (
      p_admin_id,
      'chat.message_deleted',
      'community_chat_message',
      v_message.id,
      jsonb_build_object(
        'user_id', v_message.user_id,
        'reason', v_reason,
        'message_excerpt', left(v_message.message, 120)
      )
    );
  end if;

  -- Siaran realtime tambahan: UPDATE via postgres_changes tidak sampai ke user
  -- non-admin karena baris yang sudah terhapus tidak lolos RLS SELECT.
  -- Kegagalan broadcast tidak boleh membatalkan penghapusan pesan.
  begin
    perform realtime.send(
      jsonb_build_object('message_id', v_message.id),
      'message_deleted',
      'community-chat',
      false
    );
  exception when others then
    null;
  end;
end;
$$;

revoke all on function public.admin_delete_chat_message(uuid, uuid, text) from public, anon;
grant execute on function public.admin_delete_chat_message(uuid, uuid, text) to authenticated, service_role;

-- =========================================================
-- 7) RPC: admin membisukan / membuka bisu user
-- =========================================================
create or replace function public.admin_set_chat_mute(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_muted boolean,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer set search_path = public, extensions
as $$
declare
  v_role text;
  v_reason text;
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

  if p_target_user_id is null
     or not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  v_reason := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  if p_muted and v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;

  insert into public.chat_user_status (
    user_id, is_muted, muted_reason, muted_by, muted_at
  )
  values (
    p_target_user_id,
    p_muted,
    case when p_muted then v_reason else null end,
    p_admin_id,
    case when p_muted then now() else null end
  )
  on conflict (user_id) do update
    set is_muted = excluded.is_muted,
        muted_reason = excluded.muted_reason,
        muted_by = excluded.muted_by,
        muted_at = excluded.muted_at;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    p_admin_id,
    case when p_muted then 'chat.user_muted' else 'chat.user_unmuted' end,
    'profile',
    p_target_user_id,
    jsonb_build_object('reason', v_reason)
  );

  insert into public.notifications (user_id, title, message, reference_type, reference_id)
  values (
    p_target_user_id,
    case when p_muted then 'Kamu Dibisukan dari Ruang Diskusi' else 'Bisuan Ruang Diskusi Dibuka' end,
    case
      when p_muted then 'Kamu tidak bisa mengirim pesan di Ruang Diskusi. Alasan: ' || v_reason
      else 'Kamu kembali bisa mengirim pesan di Ruang Diskusi.'
    end,
    'chat_user_status',
    p_target_user_id
  );
end;
$$;

revoke all on function public.admin_set_chat_mute(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_chat_mute(uuid, uuid, boolean, text) to authenticated, service_role;

-- =========================================================
-- Selesai v94
-- =========================================================
