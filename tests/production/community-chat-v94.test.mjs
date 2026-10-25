import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MIGRATION = 'supabase/migrations_v94_community_chat.sql';

test('v94 migrasi: tabel pesan + status bisu dengan kolom dan constraint sesuai spesifikasi', () => {
  assert.ok(fs.existsSync(path.join(root, MIGRATION)), 'migrasi v94 harus ada');
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create table if not exists public\.community_chat_messages/);
  assert.match(sql, /id uuid primary key default extensions\.uuid_generate_v4\(\)/);
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /message text not null/);
  assert.match(sql, /is_deleted boolean not null default false/);
  assert.match(sql, /deleted_by uuid references auth\.users\(id\) on delete set null/);
  assert.match(sql, /deleted_reason text/);
  assert.match(sql, /created_at timestamptz not null default now\(\)/);
  assert.match(sql, /char_length\(btrim\(message\)\) between 1 and 1000/);
  assert.match(sql, /create index if not exists idx_community_chat_messages_created/);
  assert.match(sql, /create index if not exists idx_community_chat_messages_user_created/);

  assert.match(sql, /create table if not exists public\.chat_user_status/);
  assert.match(sql, /user_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /is_muted boolean not null default false/);
  assert.match(sql, /muted_reason text/);
  assert.match(sql, /muted_by uuid references auth\.users\(id\) on delete set null/);
  assert.match(sql, /muted_at timestamptz/);
});

test('v94 RLS: pesan aktif untuk semua login, pesan terhapus hanya admin, tanpa INSERT langsung', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /alter table public\.community_chat_messages enable row level security/);
  assert.match(sql, /create policy "community_chat_messages_select_authenticated" on public\.community_chat_messages\s+for select to authenticated\s+using \(is_deleted = false or public\.is_admin\(\)\)/);
  assert.doesNotMatch(sql, /create policy "community_chat_messages_(insert|update|delete)/, 'tidak boleh ada policy tulis langsung');
  assert.match(sql, /revoke all on public\.community_chat_messages from public, anon/);
  assert.match(sql, /grant select on public\.community_chat_messages to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all) on public\.community_chat_messages to authenticated/, 'authenticated hanya boleh SELECT');

  assert.match(sql, /alter table public\.chat_user_status enable row level security/);
  assert.match(sql, /create policy "chat_user_status_select_own" on public\.chat_user_status\s+for select to authenticated\s+using \(user_id = auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /create policy "chat_user_status_(insert|update|delete)/, 'status bisu hanya lewat RPC');
  assert.match(sql, /grant select on public\.chat_user_status to authenticated/);
});

test('v94 realtime: publication INSERT/UPDATE dan broadcast untuk soft delete', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /pg_publication/);
  assert.match(sql, /pg_publication_tables/);
  assert.match(sql, /alter publication supabase_realtime add table public\.community_chat_messages/);
  assert.match(sql, /tablename = 'community_chat_messages'/);
  assert.match(sql, /realtime\.send\([\s\S]*?'message_deleted',\s*'community-chat',\s*false/);
});

test('v94 RPC post: auth, cek blokir, cek bisu + alasan, trim/length, rate limit 2 detik', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.post_community_chat_message\(\s*p_user_id uuid,\s*p_message text\s*\)\s*returns uuid/);
  assert.match(sql, /security definer set search_path = public, extensions/);
  assert.match(sql, /if auth\.uid\(\) is null then\s+raise exception 'unauthenticated'/);
  assert.match(sql, /p_user_id <> auth\.uid\(\) then\s+raise exception 'user_id_mismatch'/);
  assert.match(sql, /perform public\.assert_account_active\(p_user_id\)/);
  assert.match(sql, /from public\.chat_user_status\s+where user_id = p_user_id/);
  assert.match(sql, /if found and v_status\.is_muted then\s+raise exception 'chat_muted:%'/);
  assert.match(sql, /coalesce\(nullif\(btrim\(v_status\.muted_reason\), ''\), 'kamu dibisukan dari ruang diskusi\.'\)/);
  assert.match(sql, /v_message := btrim\(coalesce\(p_message, ''\)\)/);
  assert.match(sql, /if v_message = '' then\s+raise exception 'invalid_message'/);
  assert.match(sql, /char_length\(v_message\) > 1000 then\s+raise exception 'message_too_long'/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text, 0\)\)/);
  assert.match(sql, /created_at > now\(\) - interval '2 seconds'/);
  assert.match(sql, /raise exception 'chat_rate_limit'/);
  assert.match(sql, /insert into public\.community_chat_messages \(user_id, message\)\s+values \(p_user_id, v_message\)\s+returning id into v_id/);
  assert.match(sql, /grant execute on function public\.post_community_chat_message\(uuid, text\) to authenticated, service_role/);
});

test('v94 RPC admin hapus: role check, soft delete, audit chat.message_deleted, lock baris', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.admin_delete_chat_message\(\s*p_admin_id uuid,\s*p_message_id uuid,\s*p_reason text default null\s*\)\s*returns void/);
  assert.match(sql, /p_admin_id <> auth\.uid\(\) then\s+raise exception 'admin_mismatch'/);
  assert.match(sql, /v_role not in \('super_admin', 'admin'\) then\s+raise exception 'admin_only'/);
  assert.match(sql, /from public\.community_chat_messages\s+where id = p_message_id\s+for update/);
  assert.match(sql, /raise exception 'message_not_found'/);
  assert.match(sql, /set is_deleted = true,\s+deleted_by = p_admin_id,\s+deleted_reason = v_reason/);
  assert.match(sql, /'chat\.message_deleted'/);
  assert.match(sql, /'community_chat_message'/);
  assert.match(sql, /grant execute on function public\.admin_delete_chat_message\(uuid, uuid, text\) to authenticated, service_role/);
});

test('v94 RPC admin bisu: alasan wajib, upsert status, audit mute/unmute, notifikasi user', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.admin_set_chat_mute\(\s*p_admin_id uuid,\s*p_target_user_id uuid,\s*p_muted boolean,\s*p_reason text default null\s*\)\s*returns void/);
  assert.match(sql, /p_admin_id <> auth\.uid\(\) then\s+raise exception 'admin_mismatch'/);
  assert.match(sql, /v_role not in \('super_admin', 'admin'\) then\s+raise exception 'admin_only'/);
  assert.match(sql, /if p_muted and v_reason is null then\s+raise exception 'reason_required'/);
  assert.match(sql, /insert into public\.chat_user_status \(\s*user_id, is_muted, muted_reason, muted_by, muted_at\s*\)/);
  assert.match(sql, /on conflict \(user_id\) do update/);
  assert.match(sql, /case when p_muted then 'chat\.user_muted' else 'chat\.user_unmuted' end/);
  assert.match(sql, /insert into public\.notifications/);
  assert.match(sql, /'kamu dibisukan dari ruang diskusi'/);
  assert.match(sql, /'bisuan ruang diskusi dibuka'/);
  assert.match(sql, /alasan: ' \|\| v_reason/);
  assert.match(sql, /grant execute on function public\.admin_set_chat_mute\(uuid, uuid, boolean, text\) to authenticated, service_role/);
});

test('v94 helper nama tampilan aman: profiles tidak dibuka lewat RLS, hanya id + nama', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.community_chat_display_names\(p_user_ids uuid\[\]\)/);
  assert.match(sql, /returns table \(user_id uuid, display_name text\)/);
  assert.match(sql, /security definer set search_path = public, extensions/);
  assert.match(sql, /auth\.uid\(\) is not null/);
  assert.match(sql, /coalesce\([\s\S]*?nullif\(btrim\(p\.full_name\), ''\)[\s\S]*?'pengguna ' \|\| left\(p\.id::text, 6\)/);
  assert.doesNotMatch(sql, /split_part\(coalesce\(p\.email, ''\), '@', 1\)/, 'nama publik tidak boleh memakai email');
  assert.doesNotMatch(sql, /grant select on public\.profiles to authenticated/);
  assert.match(sql, /grant execute on function public\.community_chat_display_names\(uuid\[\]\) to authenticated, service_role/);
});

test('v94 preflight mendaftarkan file, versi 94, dan definisi wajib', () => {
  const script = read('scripts/migration-preflight.mjs');

  assert.match(script, /migrations_v94_community_chat\.sql/);
  assert.match(script, /90,93,94\]/);
  for (const keyword of [
    'community_chat_messages',
    'chat_user_status',
    'supabase_realtime',
    'post_community_chat_message',
    'CHAT_MUTED',
    'CHAT_RATE_LIMIT',
    'admin_delete_chat_message',
    'chat.message_deleted',
    'realtime.send',
    'admin_set_chat_mute',
    'chat.user_muted',
    'chat.user_unmuted',
  ]) {
    assert.ok(script.includes(keyword), `preflight harus memuat ${keyword}`);
  }
});

test('v94 UI user /diskusi: realtime INSERT/UPDATE, broadcast hapus, auto-scroll, Enter, status bisu', () => {
  const page = read('src/app/diskusi/page.tsx');
  assert.match(page, /CommunityChatRoom/);

  const ui = read('src/app/diskusi/CommunityChatRoom.tsx');
  assert.match(ui, /postgres_changes/);
  assert.match(ui, /event: "INSERT"/);
  assert.match(ui, /event: "UPDATE"/);
  assert.match(ui, /table: "community_chat_messages"/);
  assert.match(ui, /event: "message_deleted"/);
  assert.match(ui, /scrollTop = element\.scrollHeight/);
  assert.match(ui, /supabase\.rpc\("post_community_chat_message"/);
  assert.match(ui, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(ui, /maxLength=\{COMMUNITY_CHAT_MAX_LENGTH\}/);
  assert.match(ui, /justify-end/);
  assert.match(ui, /mutedChatMessage\(muted\.muted_reason\)/);
  assert.match(ui, /chatErrorMessage\(error\.message\)/);
  assert.match(ui, /community_chat_display_names/);

  const lib = read('src/lib/community-chat.ts');
  assert.match(lib, /Kamu dibisukan dari ruang diskusi\. Alasan:/);
  assert.match(lib, /CHAT_RATE_LIMIT: "Tunggu sebentar sebelum kirim pesan lagi\."/);
  assert.match(lib, /CHAT_MUTED/);
  assert.match(lib, /COMMUNITY_CHAT_MAX_LENGTH = 1000/);
  assert.match(lib, /COMMUNITY_CHAT_REALTIME_TOPIC = "community-chat"/);
});

test('v94 UI admin inline + API guard: hapus, bisukan wajib alasan, buka bisu', () => {
  const ui = read('src/app/diskusi/CommunityChatRoom.tsx');
  assert.match(ui, /isAdmin && !mine/);
  assert.match(ui, /Hapus pesan/);
  assert.match(ui, /Bisukan pengguna ini/);
  assert.match(ui, /\/api\/community-chat\/messages\/\$\{deleteTarget\.id\}\/delete/);
  assert.match(ui, /\/api\/admin\/chat-moderation\/mute/);
  assert.match(ui, /Alasan wajib diisi saat membisukan pengguna\./);

  const guard = read('src/lib/community-chat-admin.ts');
  assert.match(guard, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(String\(profile\.role\)\)/);
  assert.match(guard, /status: 401/);
  assert.match(guard, /status: 403/);

  const deleteRoute = read('src/app/api/community-chat/messages/[id]/delete/route.ts');
  assert.match(deleteRoute, /requireCommunityChatAdmin\(\)/);
  assert.match(deleteRoute, /auth\.supabase\.rpc\("admin_delete_chat_message"/);
  assert.match(deleteRoute, /p_admin_id: auth\.user\.id/);
  assert.match(deleteRoute, /p_message_id: params\.id/);
  assert.match(deleteRoute, /migrasi v94/);

  const muteRoute = read('src/app/api/admin/chat-moderation/mute/route.ts');
  assert.match(muteRoute, /user_id: z\.string\(\)\.uuid/);
  assert.match(muteRoute, /muted: z\.boolean\(\)/);
  assert.match(muteRoute, /Alasan wajib diisi saat membisukan pengguna\./);
  assert.match(muteRoute, /auth\.supabase\.rpc\("admin_set_chat_mute"/);
  assert.match(muteRoute, /p_muted: parsed\.data\.muted/);
});

test('v94 halaman admin chat-moderation: daftar dibisukan + buka bisu + sidebar', () => {
  const page = read('src/app/admin/chat-moderation/page.tsx');
  assert.match(page, /\/api\/admin\/chat-moderation\/muted/);
  assert.match(page, /\/api\/admin\/chat-moderation\/mute/);
  assert.match(page, /Pengguna Dibisukan/);
  assert.match(page, /Buka bisu/);
  assert.match(page, /Buka Ruang Diskusi/);
  assert.match(page, /muted: false/);
  assert.match(page, /Dibisukan/);
  assert.match(page, /Alasan:/);

  const mutedRoute = read('src/app/api/admin/chat-moderation/muted/route.ts');
  assert.match(mutedRoute, /requireCommunityChatAdmin\(\)/);
  assert.match(mutedRoute, /createAdminClient\(\)/);
  assert.match(mutedRoute, /\.eq\("is_muted", true\)/);
  assert.match(mutedRoute, /chat_user_status/);
  assert.match(mutedRoute, /full_name/);
  assert.match(mutedRoute, /muted_reason/);

  const sidebar = read('src/app/admin/AdminSidebar.tsx');
  assert.match(sidebar, /"\/admin\/chat-moderation"/);
  assert.match(sidebar, /Moderasi Diskusi/);

  const navbar = read('src/components/Navbar.tsx');
  assert.match(navbar, /href="\/diskusi"/);
  assert.match(navbar, /Ruang Diskusi/);
});

test('v94 tidak membuka jalur tulis langsung, tidak menyentuh Midtrans/ledger, tanpa kredensial', () => {
  const sql = read(MIGRATION).toLowerCase();
  assert.doesNotMatch(sql, /alter table public\.topups/);
  assert.doesNotMatch(sql, /update public\.topups/);
  assert.doesNotMatch(sql, /insert into public\.topups/);
  assert.doesNotMatch(sql, /update public\.wallets/);
  assert.doesNotMatch(sql, /insert into public\.wallet_transactions/);
  assert.doesNotMatch(sql, /create or replace function public\.confirm_/);
  assert.doesNotMatch(sql, /midtrans_server_key/);

  const ui = read('src/app/diskusi/CommunityChatRoom.tsx');
  assert.doesNotMatch(ui, /\.from\("community_chat_messages"\)[\s\S]{0,80}\.insert\(/);
  assert.doesNotMatch(ui, /\.from\("community_chat_messages"\)[\s\S]{0,80}\.update\(/);
  assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(ui, /service_role/);

  for (const file of [
    'src/app/diskusi/CommunityChatRoom.tsx',
    'src/lib/community-chat.ts',
    'src/lib/community-chat-admin.ts',
    'src/app/api/community-chat/messages/[id]/delete/route.ts',
    'src/app/api/admin/chat-moderation/mute/route.ts',
    'src/app/api/admin/chat-moderation/muted/route.ts',
    'src/app/admin/chat-moderation/page.tsx',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /SB-Mid-server|SB-Mid-client|MIDTRANS_SERVER_KEY\s*=\s*["']/, `${file} tidak boleh memuat kredensial`);
    assert.doesNotMatch(source, /service_role\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/, `${file} tidak boleh memuat service role key`);
  }
});
