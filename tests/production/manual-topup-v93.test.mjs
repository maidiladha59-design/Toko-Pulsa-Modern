import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MIGRATION = 'supabase/migrations_v93_manual_topup.sql';

test('v93 migrasi: tabel channel, permintaan, dan pengaturan single-row', () => {
  assert.ok(fs.existsSync(path.join(root, MIGRATION)), 'migrasi v93 harus ada');
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create table if not exists public\.manual_topup_channels/);
  assert.match(sql, /id uuid primary key default extensions\.uuid_generate_v4\(\)/);
  assert.match(sql, /channel_type text not null,[\s\S]*?account_number text,[\s\S]*?account_holder_name text,[\s\S]*?qris_image_url text,[\s\S]*?instructions text,[\s\S]*?is_active boolean not null default true,[\s\S]*?sort_order integer not null default 0,/);
  assert.match(sql, /updated_by uuid references auth\.users\(id\) on delete set null/);
  assert.match(sql, /manual_topup_channels_type_check[\s\S]*?check \(channel_type in \('dana', 'gopay', 'shopeepay', 'bank_jago', 'blu_bca', 'qris', 'lainnya'\)\)/);
  assert.match(sql, /manual_topup_channels_qris_image_check[\s\S]*?channel_type <> 'qris' or \(qris_image_url is not null and btrim\(qris_image_url\) <> ''\)/);

  assert.match(sql, /create table if not exists public\.manual_topup_requests/);
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /channel_id uuid references public\.manual_topup_channels\(id\) on delete set null/);
  assert.match(sql, /channel_type text not null,[\s\S]*?amount bigint not null check \(amount > 0\),[\s\S]*?proof_image_url text not null/);
  assert.match(sql, /status text not null default 'pending'/);
  assert.match(sql, /admin_note text,[\s\S]*?reviewed_by uuid references auth\.users\(id\) on delete set null,[\s\S]*?reviewed_at timestamptz,/);
  assert.match(sql, /manual_topup_requests_status_check\s+check \(status in \('pending', 'approved', 'rejected'\)\)/);

  assert.match(sql, /create table if not exists public\.manual_topup_settings/);
  assert.match(sql, /id integer primary key default 1 check \(id = 1\)/);
  assert.match(sql, /is_enabled boolean not null default true,[\s\S]*?min_amount bigint not null default 10000[\s\S]*?max_amount bigint not null default 5000000/);
  assert.match(sql, /insert into public\.manual_topup_settings[\s\S]*?values \(1, true, 10000, 5000000\)[\s\S]*?on conflict \(id\) do nothing/);

  assert.match(sql, /create index if not exists idx_manual_topup_channels_active/);
  assert.match(sql, /create index if not exists idx_manual_topup_requests_status/);
});

test('v93 RLS: user hanya data sendiri, ADMIN/SUPER_ADMIN lewat is_admin()', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /alter table public\.manual_topup_channels enable row level security/);
  assert.match(sql, /alter table public\.manual_topup_requests enable row level security/);
  assert.match(sql, /alter table public\.manual_topup_settings enable row level security/);

  assert.match(sql, /create policy "manual_topup_channels_select_active_or_admin" on public\.manual_topup_channels\s+for select to authenticated\s+using \(is_active = true or public\.is_admin\(\)\)/);
  for (const action of ['insert', 'update', 'delete']) {
    assert.match(
      sql,
      new RegExp(`create policy "manual_topup_channels_admin_${action}" on public\\.manual_topup_channels\\s+for ${action} to authenticated[\\s\\S]*?public\\.is_admin\\(\\)`),
      `channel harus punya policy admin ${action}`
    );
  }

  assert.match(sql, /create policy "manual_topup_requests_select_own_or_admin" on public\.manual_topup_requests\s+for select to authenticated\s+using \(user_id = auth\.uid\(\) or public\.is_admin\(\)\)/);
  assert.match(sql, /create policy "manual_topup_requests_insert_own" on public\.manual_topup_requests\s+for insert to authenticated\s+with check \([\s\S]*?user_id = auth\.uid\(\)[\s\S]*?status = 'pending'[\s\S]*?reviewed_by is null[\s\S]*?reviewed_at is null/);
  assert.doesNotMatch(sql, /create policy "manual_topup_requests_(update|delete)/, 'user tidak boleh update/delete hasil review langsung');

  assert.match(sql, /revoke all on public\.manual_topup_requests from public, anon/);
  assert.match(sql, /grant select, insert on public\.manual_topup_requests to authenticated/);
  assert.doesNotMatch(sql, /grant (update|all) on public\.manual_topup_requests to authenticated/, 'status hanya boleh berubah lewat RPC');

  assert.match(sql, /create policy "manual_topup_settings_select_authenticated" on public\.manual_topup_settings\s+for select to authenticated\s+using \(true\)/);
  assert.match(sql, /create policy "manual_topup_settings_admin_write" on public\.manual_topup_settings\s+for all to authenticated[\s\S]*?public\.is_admin\(\)/);
});

test('v93 storage: bukti privat per folder user, QRIS publik hanya admin yang menulis', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /values \('manual-topup-proofs', 'manual-topup-proofs', false\)\s+on conflict \(id\) do update set public = false/);
  assert.match(sql, /create policy "manual_topup_proofs_insert_own" on storage\.objects\s+for insert to authenticated/);
  assert.ok(sql.includes("(storage.foldername(name))[1] = auth.uid()::text"));
  assert.ok(sql.includes("lower(name) ~ '\\.(jpe?g|png|webp)$'"));
  assert.match(sql, /create policy "manual_topup_proofs_select_own_or_admin"[\s\S]*?bucket_id = 'manual-topup-proofs'[\s\S]*?auth\.uid\(\)::text[\s\S]*?public\.is_admin\(\)/);
  assert.match(sql, /create policy "manual_topup_proofs_delete_own_or_admin"[\s\S]*?public\.is_admin\(\)/);

  assert.match(sql, /values \('qris-images', 'qris-images', true\)\s+on conflict \(id\) do update set public = true/);
  assert.match(sql, /create policy "qris_images_public_read" on storage\.objects\s+for select using \(bucket_id = 'qris-images'\)/);
  for (const action of ['insert', 'update', 'delete']) {
    assert.match(
      sql,
      new RegExp(`create policy "qris_images_admin_${action}" on storage\\.objects[\\s\\S]*?bucket_id = 'qris-images' and public\\.is_admin\\(\\)`),
      `QRIS harus punya policy admin ${action}`
    );
  }
});

test('v93 RPC submit: validasi channel aktif, nominal, folder bukti, snapshot tipe', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.submit_manual_topup_request\(\s*p_user_id uuid,\s*p_channel_id uuid,\s*p_amount bigint,\s*p_proof_image_url text\s*\)\s*returns uuid/);
  assert.match(sql, /security definer set search_path = public, extensions/);
  assert.match(sql, /if auth\.uid\(\) is null then\s+raise exception 'unauthenticated'/);
  assert.match(sql, /p_user_id <> auth\.uid\(\) then\s+raise exception 'user_id_mismatch'/);
  assert.match(sql, /perform public\.assert_account_active\(p_user_id\)/);
  assert.match(sql, /if p_amount is null or p_amount <= 0 then\s+raise exception 'invalid_amount'/);
  assert.match(sql, /not v_settings\.is_enabled then\s+raise exception 'manual_topup_disabled'/);
  assert.match(sql, /p_amount < v_settings\.min_amount then\s+raise exception 'below_min_amount'/);
  assert.match(sql, /p_amount > v_settings\.max_amount then\s+raise exception 'above_max_amount'/);
  assert.match(sql, /where id = p_channel_id and is_active = true/);
  assert.match(sql, /raise exception 'channel_not_available'/);
  assert.match(sql, /raise exception 'proof_required'/);
  assert.match(sql, /split_part\(v_proof, '\/', 1\) <> p_user_id::text then\s+raise exception 'invalid_proof_path'/);

  assert.match(sql, /insert into public\.manual_topup_requests \(\s*user_id, channel_id, channel_type, amount, proof_image_url\s*\)\s+values \(\s*p_user_id, v_channel\.id, v_channel\.channel_type, p_amount, v_proof\s*\)/);

  assert.match(sql, /insert into public\.notifications[\s\S]*?where p\.role in \('admin', 'super_admin'\)/);
  assert.match(sql, /'manual_topup\.request',\s*'manual_topup_request'/);
  assert.match(sql, /revoke all on function public\.submit_manual_topup_request\(uuid, uuid, bigint, text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.submit_manual_topup_request\(uuid, uuid, bigint, text\) to authenticated, service_role/);
});

test('v93 RPC admin APPROVE: kunci wallet, ledger TOPUP, notifikasi, audit', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /create or replace function public\.admin_process_manual_topup\(\s*p_admin_id uuid,\s*p_request_id uuid,\s*p_action text,\s*p_note text default null\s*\)\s*returns jsonb/);
  assert.match(sql, /if auth\.uid\(\) is null then\s+raise exception 'unauthenticated'/);
  assert.match(sql, /p_admin_id <> auth\.uid\(\) then\s+raise exception 'admin_mismatch'/);
  assert.match(sql, /v_role not in \('super_admin', 'admin'\) then\s+raise exception 'admin_only'/);
  assert.match(sql, /v_action not in \('approve', 'reject'\) then\s+raise exception 'invalid_action'/);
  assert.match(sql, /from public\.manual_topup_requests\s+where id = p_request_id\s+for update/);
  assert.match(sql, /v_request\.status <> 'pending' then\s+raise exception 'request_already_processed'/);

  assert.match(sql, /insert into public\.wallets \(user_id, balance\)\s+values \(v_request\.user_id, 0\)\s+on conflict \(user_id\) do nothing/);
  assert.match(sql, /from public\.wallets\s+where user_id = v_request\.user_id\s+for update/);
  assert.match(sql, /v_after := v_before \+ v_request\.amount/);
  assert.match(sql, /update public\.wallets\s+set balance = v_after, updated_at = now\(\)/);
  assert.match(sql, /insert into public\.wallet_transactions \(\s*wallet_id, type, amount, balance_before, balance_after,\s*reference_type, reference_id, description\s*\)\s+values \(\s*v_wallet\.id, 'topup', v_request\.amount, v_before, v_after,\s*'manual_topup_request', v_request\.id,\s*'top up manual disetujui admin'\s*\)/);
  assert.match(sql, /set status = 'approved',[\s\S]*?reviewed_by = p_admin_id,[\s\S]*?reviewed_at = now\(\)/);
  assert.match(sql, /'top up berhasil'/);
  assert.match(sql, /'manual_topup\.approve'/);
  assert.match(sql, /'balance_before', v_before,\s*'balance_after', v_after/);
});

test('v93 RPC admin REJECT: alasan wajib, tidak menyentuh wallet, alasan dikirim ke user', () => {
  const sql = read(MIGRATION).toLowerCase();

  assert.match(sql, /v_action = 'reject' and char_length\(v_note\) < 5 then\s+raise exception 'note_required'/);

  const rejectStart = sql.indexOf("if v_action = 'reject' then");
  const walletLock = sql.indexOf('from public.wallets');
  const walletUpdate = sql.indexOf('update public.wallets');
  assert.ok(rejectStart > 0, 'cabang reject harus ada');
  assert.ok(walletLock > rejectStart, 'wallet hanya disentuh setelah cabang reject selesai');
  assert.ok(walletUpdate > rejectStart, 'saldo tidak boleh berubah pada cabang reject');

  const rejectBlock = sql.slice(rejectStart, walletLock);
  assert.match(rejectBlock, /set status = 'rejected'/);
  assert.match(rejectBlock, /admin_note = left\(v_note, 500\)/);
  assert.match(rejectBlock, /'top up manual ditolak'/);
  assert.match(rejectBlock, /alasan: ' \|\| left\(v_note, 200\)/);
  assert.match(rejectBlock, /'manual_topup\.reject'/);
  assert.match(rejectBlock, /'status', 'rejected'/);
  assert.doesNotMatch(rejectBlock, /insert into public\.wallet_transactions/);
  assert.doesNotMatch(rejectBlock, /update public\.wallets/);

  assert.match(sql, /revoke all on function public\.admin_process_manual_topup\(uuid, uuid, text, text\) from public, anon/);
  assert.match(sql, /grant execute on function public\.admin_process_manual_topup\(uuid, uuid, text, text\) to authenticated, service_role/);
});

test('v93 preflight mendaftarkan file, versi, dan definisi wajib', () => {
  const script = read('scripts/migration-preflight.mjs');

  assert.match(script, /migrations_v93_manual_topup\.sql/);
  assert.match(script, /90,93,94,97,98]/);
  for (const keyword of [
    'manual_topup_channels',
    'manual_topup_requests',
    'manual_topup_settings',
    'manual-topup-proofs',
    'qris-images',
    'submit_manual_topup_request',
    'admin_process_manual_topup',
    'manual_topup.approve',
    'manual_topup.reject',
    "'TOPUP'",
    'for update',
  ]) {
    assert.ok(script.includes(keyword), `preflight harus memuat ${keyword}`);
  }
});

test('v93 API user: channel aktif, upload bukti privat, riwayat + signed URL', () => {
  const channels = read('src/app/api/topup/manual/channels/route.ts');
  assert.match(channels, /supabase\.auth\.getUser\(\)/);
  assert.match(channels, /\.eq\("is_active", true\)/);
  assert.match(channels, /manual_topup_settings/);
  assert.match(channels, /enabled: Boolean\(settings\?\.is_enabled\)/);

  const submit = read('src/app/api/topup/manual/request/route.ts');
  assert.match(submit, /account_status === "BLOCKED"/);
  assert.match(submit, /channel_id: z\.string\(\)\.uuid\(\)/);
  assert.match(submit, /amount: z\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(submit, /MANUAL_PROOF_MIME_TYPES/);
  assert.match(submit, /MANUAL_PROOF_MAX_BYTES/);
  assert.match(submit, /const proofPath = `\$\{user\.id\}\/\$\{crypto\.randomUUID\(\)\}\.\$\{extension\}`/);
  assert.match(submit, /\.from\(MANUAL_PROOF_BUCKET\)\s*\.upload\(proofPath, proof, \{ contentType: proof\.type, upsert: false \}\)/);
  assert.match(submit, /supabase\.rpc\("submit_manual_topup_request"/);
  assert.match(submit, /p_user_id: user\.id/);
  assert.match(submit, /p_proof_image_url: proofPath/);
  assert.match(submit, /\.remove\(\[proofPath\]\)/);
  assert.match(submit, /status: 201/);

  const history = read('src/app/api/topup/manual/history/route.ts');
  assert.match(history, /\.eq\("user_id", user\.id\)/);
  assert.match(history, /manual_topup_channels\(display_name, account_number, account_holder_name\)/);
  assert.match(history, /\.createSignedUrl\(row\.proof_image_url, 300\)/);
  assert.match(history, /admin_note: row\.admin_note/);
  assert.match(history, /proof_url: signedUrls\.get\(row\.proof_image_url\) \?\? null/);

  const lib = read('src/lib/manual-topup.ts');
  assert.match(lib, /MANUAL_PROOF_BUCKET = "manual-topup-proofs"/);
  assert.match(lib, /MANUAL_QRIS_BUCKET = "qris-images"/);
  assert.match(lib, /MANUAL_PROOF_MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(lib, /"image\/jpeg", "image\/png", "image\/webp"/);
  assert.match(lib, /REQUEST_ALREADY_PROCESSED/);
  assert.match(lib, /NOTE_REQUIRED/);
});

test('v93 UI user: pilih Otomatis/Manual, bukti, pending, riwayat, alasan tolak', () => {
  const page = read('src/app/wallet/topup/page.tsx');
  assert.match(page, /Top Up Saldo Otomatis/);
  assert.match(page, /Instan, saldo masuk otomatis/);
  assert.match(page, /Top Up Manual/);
  assert.match(page, /Dicek admin, maksimal 1x24 jam/);
  assert.match(page, /Pilih cara Top Up/);
  assert.match(page, /<TopUpForm\/>/);
  assert.match(page, /<ManualTopupForm\/>/);
  // Form otomatis Midtrans tetap utuh.
  assert.match(page, /Buat Instruksi Pembayaran/);
  assert.match(page, /payment-methods/);
  assert.match(page, /Batalkan Top Up/);

  const manual = read('src/app/wallet/topup/ManualTopupForm.tsx');
  assert.match(manual, /\/api\/topup\/manual\/channels/);
  assert.match(manual, /\/api\/topup\/manual\/history/);
  assert.match(manual, /\/api\/topup\/manual\/request/);
  assert.match(manual, /Salin Nomor Tujuan/);
  assert.match(manual, /Pindai QRIS/);
  assert.match(manual, /qris_image_url/);
  assert.match(manual, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(manual, /Pratinjau bukti transfer/);
  assert.doesNotMatch(manual, /channel pembayaran/);
  assert.match(manual, /URL\.createObjectURL/);
  assert.match(manual, /Kirim Konfirmasi Top Up/);
  assert.match(manual, /Menunggu konfirmasi admin \(maksimal 1x24 jam\)/);
  assert.match(manual, /Riwayat Top Up Manual/);
  assert.match(manual, /Alasan penolakan: \{item\.admin_note\}/);
  assert.match(manual, /formatRupiah\(settings\.min_amount\)/);
  assert.match(manual, /formatRupiah\(settings\.max_amount\)/);
});

test('v93 API admin: guard role, CRUD channel, QRIS, settings, filter & proses', () => {
  const guard = read('src/lib/manual-topup-admin.ts');
  assert.match(guard, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(String\(profile\.role\)\)/);
  assert.match(guard, /status: 401/);
  assert.match(guard, /status: 403/);

  const channels = read('src/app/api/admin/manual-topup/channels/route.ts');
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    assert.match(channels, new RegExp(`export async function ${method}`));
  }
  assert.match(channels, /requireManualTopupAdmin\(\)/);
  assert.match(channels, /Nomor rekening \/ akun wajib diisi\./);
  assert.match(channels, /Gambar QRIS wajib diunggah untuk channel QRIS\./);
  assert.match(channels, /qrisImageUrl\.startsWith\("https:\/\/"\)/);
  assert.match(channels, /\.eq\("status", "PENDING"\)/);
  assert.match(channels, /Nonaktifkan saja channel ini\./);
  assert.match(channels, /status: 409/);
  assert.match(channels, /manual_topup\.channel_create/);
  assert.match(channels, /manual_topup\.channel_update/);
  assert.match(channels, /manual_topup\.channel_delete/);

  const qris = read('src/app/api/admin/manual-topup/qris/route.ts');
  assert.match(qris, /MANUAL_QRIS_BUCKET/);
  assert.match(qris, /const path = `qris\/\$\{crypto\.randomUUID\(\)\}\.\$\{extension\}`/);
  assert.match(qris, /getPublicUrl\(path\)/);
  assert.match(qris, /status: 201/);

  const settings = read('src/app/api/admin/manual-topup/settings/route.ts');
  assert.match(settings, /value\.max_amount >= value\.min_amount/);
  assert.match(settings, /manual_topup\.settings_update/);
  assert.match(settings, /\.eq\("id", 1\)/);

  const requests = read('src/app/api/admin/manual-topup/requests/route.ts');
  assert.match(requests, /\["ALL", "PENDING", "APPROVED", "REJECTED"\]/);
  assert.match(requests, /\.limit\(200\)/);
  assert.match(requests, /if \(status !== "ALL"\) query = query\.eq\("status", status\)/);
  assert.match(requests, /\.createSignedUrl\(row\.proof_image_url, 600\)/);
  assert.match(requests, /counts: \{/);
  assert.match(requests, /user_name:/);
  assert.match(requests, /proof_url:/);

  const process = read('src/app/api/admin/manual-topup/requests/[id]/route.ts');
  assert.match(process, /z\.enum\(\["APPROVE", "REJECT"\]\)/);
  assert.match(process, /parsed\.data\.action === "REJECT" && note\.length < 5/);
  assert.match(process, /auth\.supabase\.rpc\("admin_process_manual_topup"/);
  assert.match(process, /p_admin_id: auth\.user\.id/);
  assert.match(process, /REQUEST_ALREADY_PROCESSED/);
  assert.match(process, /status = code === "REQUEST_NOT_FOUND"\s*\?\s*404/);
});

test('v93 UI admin: channel, QRIS, settings, tab permintaan, bukti, approve/tolak', () => {
  const channels = read('src/app/admin/manual-topup/channels/page.tsx');
  assert.match(channels, /\/api\/admin\/manual-topup\/channels/);
  assert.match(channels, /\/api\/admin\/manual-topup\/qris/);
  assert.match(channels, /\/api\/admin\/manual-topup\/settings/);
  assert.match(channels, /Aktifkan Top Up Manual/);
  assert.match(channels, /Nominal minimum/);
  assert.match(channels, /Nominal maksimum/);
  assert.match(channels, /Nonaktifkan/);
  assert.match(channels, /Hapus/);
  assert.match(channels, /Gambar QRIS/);
  assert.match(channels, /Nomor rekening \/ akun/);

  const requests = read('src/app/admin/manual-topup/requests/page.tsx');
  assert.match(requests, /status=\$\{status\}/);
  assert.match(requests, /"PENDING", label: "Menunggu"/);
  assert.match(requests, /"APPROVED", label: "Disetujui"/);
  assert.match(requests, /"REJECTED", label: "Ditolak"/);
  assert.match(requests, /action: "APPROVE"/);
  assert.match(requests, /action: "REJECT"/);
  assert.match(requests, /note\.trim\(\)\.length < 5/);
  assert.match(requests, /Alasan penolakan wajib diisi minimal 5 karakter\./);
  assert.match(requests, /Perbesar bukti/);
  assert.match(requests, /request\.proof_url/);
  assert.match(requests, /Setujui Top Up Manual sebesar/);
  assert.match(requests, /Saldo pengguna akan langsung bertambah\./);
  assert.match(requests, /Alasan sudah dikirim ke pengguna\./);

  const sidebar = read('src/app/admin/AdminSidebar.tsx');
  assert.match(sidebar, /"\/admin\/manual-topup\/requests", "🧾", "Top Up Manual"/);
  assert.match(sidebar, /"\/admin\/manual-topup\/channels", "🏦", "Channel Top Up Manual"/);
});

test('v93 tidak menyentuh alur Midtrans/ledger gateway dan tidak memuat kredensial', () => {
  const sql = read(MIGRATION).toLowerCase();
  assert.doesNotMatch(sql, /alter table public\.topups/);
  assert.doesNotMatch(sql, /update public\.topups/);
  assert.doesNotMatch(sql, /insert into public\.topups/);
  assert.doesNotMatch(sql, /create or replace function public\.confirm_/);
  assert.doesNotMatch(sql, /midtrans_server_key/);

  const topupRoute = read('src/app/api/topup/route.ts');
  assert.match(topupRoute, /createGatewayTransaction/);
  assert.match(topupRoute, /MIDTRANS_SERVER_KEY/);
  assert.match(topupRoute, /if \(!isGatewayConfigured\(\)\)/);

  const webhook = read('src/app/api/payments/midtrans/webhook/route.ts');
  assert.match(webhook, /signature_key|signatureKey|sha512/i);
  assert.match(webhook, /getGatewayTransactionDetail|confirm_gateway_topup/);

  for (const file of [
    'src/app/api/topup/manual/request/route.ts',
    'src/app/api/topup/manual/history/route.ts',
    'src/app/api/admin/manual-topup/channels/route.ts',
    'src/app/api/admin/manual-topup/requests/route.ts',
    'src/app/api/admin/manual-topup/requests/[id]/route.ts',
    'src/app/api/admin/manual-topup/qris/route.ts',
    'src/app/api/admin/manual-topup/settings/route.ts',
    'src/lib/manual-topup.ts',
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /SB-Mid-server|SB-Mid-client|MIDTRANS_SERVER_KEY\s*=\s*["']/, `${file} tidak boleh memuat kredensial`);
    assert.doesNotMatch(source, /service_role\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/, `${file} tidak boleh memuat service role key`);
  }
});
