import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = (p) => fs.readFileSync(p, 'utf8');

async function loadUtils() {
  const source = read('src/lib/utils.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('v88 migrasi status akun tidak mengubah skema lama secara destruktif', () => {
  const sql = read('supabase/migrations_v88_admin_user_controls.sql').toLowerCase();
  assert.match(sql, /add column if not exists account_status text not null default 'active'/);
  assert.match(sql, /add column if not exists blocked_at timestamptz/);
  assert.match(sql, /add column if not exists blocked_reason text/);
  assert.match(sql, /profiles_account_status_check/);
  assert.match(sql, /account_status in \('active', 'blocked'\)/);
  assert.match(sql, /where account_status = 'blocked'/);
  assert.doesNotMatch(sql, /drop table/);
  assert.doesNotMatch(sql, /drop column/);
  assert.doesNotMatch(sql, /alter column/);
});

test('v88 RPC saldo dua arah: role dicek di DB, wallet dikunci, alasan wajib', () => {
  const sql = read('supabase/migrations_v88_admin_user_controls.sql');
  assert.match(sql, /create or replace function public\.admin_adjust_user_balance\(/i);
  assert.match(sql, /p_direction text/);
  assert.match(sql, /p_direction not in \('CREDIT', 'DEBIT'\)/);
  assert.match(sql, /p_admin_id <> auth\.uid\(\)/);
  assert.match(sql, /v_role not in \('SUPER_ADMIN', 'ADMIN', 'STAFF'\)/);
  assert.match(sql, /where user_id = p_target_user_id for update/);
  assert.match(sql, /raise exception 'INSUFFICIENT_BALANCE'/);
  assert.match(sql, /raise exception 'REASON_REQUIRED'/);
  assert.match(sql, /v_delta := case when p_direction = 'CREDIT' then p_amount else -p_amount end/);
  // Ledger ADJUSTMENT bertanda (positif kredit, negatif debit) + jejak admin & alasan.
  assert.match(sql, /v_wallet\.id, 'ADJUSTMENT', v_delta, v_before, v_after/);
  assert.match(sql, /'Penyesuaian saldo oleh ' \|\| v_admin_name/);
  assert.match(sql, /wallet\.admin_adjust/);
  assert.match(sql, /'target_user_id', p_target_user_id/);
  assert.match(sql, /'direction', p_direction/);
  assert.match(sql, /'reason', v_reason/);
  // Notifikasi menyebut nominal & alasan singkat, tanpa data sensitif lain.
  assert.match(sql, /insert into public\.notifications/);
  assert.match(sql, /left\(v_reason, 200\)/);
});

test('v88 RPC blokir wajib alasan, clear saat aktif, audit + notifikasi', () => {
  const sql = read('supabase/migrations_v88_admin_user_controls.sql');
  assert.match(sql, /create or replace function public\.admin_set_user_status\(/i);
  assert.match(sql, /p_status not in \('ACTIVE', 'BLOCKED'\)/);
  assert.match(sql, /where id = p_target_user_id for update/);
  assert.match(sql, /p_status = 'BLOCKED' and char_length\(v_reason\) < 5/);
  assert.match(sql, /blocked_at = case when p_status = 'BLOCKED' then now\(\) else null end/);
  assert.match(sql, /blocked_reason = case when p_status = 'BLOCKED' then v_reason else null end/);
  assert.match(sql, /'user\.admin_status'/);
  assert.match(sql, /'Akun Diblokir'/);
  assert.match(sql, /'Akun Aktif Kembali'/);
});

test('v88 semua RPC transaksi memanggil assert_account_active + guard debit wallet', () => {
  const sql = read('supabase/migrations_v88_admin_user_controls.sql');
  const guards = sql.match(/perform public\.assert_account_active\(p_user_id\);/g) || [];
  assert.equal(guards.length, 8, 'delapan RPC transaksi harus dipasangi guard');

  for (const fn of [
    'checkout',
    'checkout_with_voucher',
    'create_wallet_transfer',
    'create_ppob_prepaid_wallet_order',
    'create_ppob_postpaid_wallet_order',
    'create_ppob_postpaid_gateway_order',
    'create_qris_order',
    'create_gateway_order',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\s*\\(`), `RPC ${fn} harus ada`);
  }

  assert.match(sql, /raise exception 'ACCOUNT_BLOCKED'/);
  assert.match(sql, /trg_guard_blocked_wallet_debit/);
  assert.match(sql, /new\.balance < old\.balance/);
  assert.match(sql, /not public\.is_admin_or_staff\(\)/);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
});

test('v88 migrasi terdaftar di preflight dan pin versi v86 diperbarui', () => {
  const script = read('scripts/migration-preflight.mjs');
  assert.match(script, /migrations_v88_admin_user_controls\.sql/);
  assert.match(script, /83,85,86,87,88,89,90,93,94,97,98,99]/);

  const v86 = read('tests/production/topup-va-methods-v86.test.mjs');
  assert.ok(v86.includes('83,85,86,87,88'), 'pin versi v86 harus mencakup v88');
});

test('v88 formatBalanceCompact meringkas angka besar sesuai notasi Indonesia', async () => {
  const { formatBalanceCompact } = await loadUtils();
  assert.equal(formatBalanceCompact(0), 'Rp 0');
  assert.equal(formatBalanceCompact(750_000), 'Rp 750.000');
  assert.equal(formatBalanceCompact(999_999), 'Rp 999.999');
  assert.equal(formatBalanceCompact(1_000_000), 'Rp 1 Jt');
  assert.equal(formatBalanceCompact(12_000_000), 'Rp 12 Jt');
  assert.equal(formatBalanceCompact(12_500_000), 'Rp 12,5 Jt');
  assert.equal(formatBalanceCompact(1_000_000_000), 'Rp 1 M');
  assert.equal(formatBalanceCompact(100_000_000_000), 'Rp 100 M');
  assert.equal(formatBalanceCompact(1_050_000_000), 'Rp 1,1 M');
  assert.equal(formatBalanceCompact(1_200_000_000_000), 'Rp 1,2 T');
  assert.equal(formatBalanceCompact(Number.NaN), 'Rp 0');
});

test('v88 saldo ringkas dipakai di tabel/kartu + nilai penuh tetap di tooltip', () => {
  const users = read('src/app/admin/users/page.tsx');
  assert.match(users, /formatBalanceCompact\(u\.balance\)/);
  assert.match(users, /max-w-\[9rem\] truncate/);
  assert.match(users, /title=\{formatRupiah\(u\.balance\)\}/);

  const dashboard = read('src/app/dashboard/page.tsx');
  assert.match(dashboard, /formatBalanceCompact\(wallet\?\.balance \|\| 0\)/);
  assert.match(dashboard, /title=\{formatRupiah\(wallet\?\.balance \|\| 0\)\}/);

  const analytics = read('src/app/admin/analytics/page.tsx');
  assert.match(analytics, /formatBalanceCompact\(r\.balance\)/);
  assert.match(analytics, /max-w-\[10rem\] truncate/);
  assert.match(analytics, /title=\{formatRupiah\(r\.balance\)\}/);

  const ranking = read('src/app/ranking/page.tsx');
  assert.match(ranking, /formatBalanceCompact\(row\.successful_amount\)/);
  assert.match(ranking, /formatBalanceCompact\(data\.me\.successful_amount\)/);

  const admin = read('src/app/admin/page.tsx');
  assert.match(admin, /formatBalanceCompact\(revenue\)/);
  assert.match(admin, /title: formatRupiah\(revenue\)/);

  const finance = read('src/app/admin/finance/page.tsx');
  assert.match(finance, /formatBalanceCompact\(Number\(value\|\|0\)\)/);
  assert.match(finance, /title=\{rupiah\(value\)\}/);
});

test('v88 API admin memakai sesi admin (bukan service role) untuk kedua RPC', () => {
  const wallet = read('src/app/api/admin/users/[id]/wallet/route.ts');
  assert.match(wallet, /z\.enum\(\["CREDIT", "DEBIT"\]\)/);
  assert.match(wallet, /min\(5/);
  assert.match(wallet, /supabase\.rpc\("admin_adjust_user_balance"/);
  assert.match(wallet, /p_admin_id: user\.id/);
  assert.match(wallet, /p_direction: parsed\.data\.direction/);
  assert.doesNotMatch(wallet, /createAdminClient/);

  const status = read('src/app/api/admin/users/[id]/status/route.ts');
  assert.match(status, /z\.enum\(\["ACTIVE", "BLOCKED"\]\)/);
  assert.match(status, /supabase\.rpc\("admin_set_user_status"/);
  assert.match(status, /p_admin_id: user\.id/);
  assert.doesNotMatch(status, /createAdminClient/);
});

test('v88 Kelola Pengguna punya modal saldo dua arah dengan preview', () => {
  const page = read('src/app/admin/users/page.tsx');
  assert.match(page, /\+\ Tambah/);
  assert.match(page, /− Kurangi/);
  assert.match(page, /Alasan Penyesuaian/);
  assert.match(page, /Saldo saat ini/);
  assert.match(page, /Saldo setelah perubahan/);
  assert.match(page, /formatRupiah\(afterBalance\)/);
  assert.match(page, /overspent/);
  assert.match(page, /\/api\/admin\/users\/\$\{balanceDraft\.user\.id\}\/wallet/);
  assert.match(page, /direction: balanceDraft\.direction, amount, reason/);
});

test('v88 Kelola Pengguna menampilkan status + aksi blokir/buka blokir', () => {
  const page = read('src/app/admin/users/page.tsx');
  assert.match(page, /account_status/);
  assert.match(page, /u\.account_status === "BLOCKED" \? "Diblokir" : "Aktif"/);
  assert.match(page, /u\.account_status === "BLOCKED" \? "Buka Blokir" : "Blokir"/);
  assert.match(page, /Alasan Blokir/);
  assert.match(page, /\/api\/admin\/users\/\$\{statusDraft\.user\.id\}\/status/);
  assert.match(page, /status: "BLOCKED", reason/);
  assert.match(page, /status: "ACTIVE"/);
});

test('v88 akun diblokir dipaksa keluar dan diarahkan ke halaman Akun Diblokir', () => {
  const middleware = read('src/lib/supabase/middleware.ts');
  assert.match(middleware, /select\("last_activity_at, account_status"\)/);
  assert.match(middleware, /account_status === "BLOCKED"/);
  assert.match(middleware, /pathname !== "\/akun-diblokir"/);
  assert.match(middleware, /blockedUrl\.pathname = "\/akun-diblokir"/);
  assert.match(middleware, /"\/akun-diblokir",/);

  const login = read('src/app/login/page.tsx');
  assert.match(login, /select\("account_status, blocked_reason"\)/);
  assert.match(login, /profile\?\.account_status === "BLOCKED"/);
  assert.match(login, /encodeURIComponent\(profile\.blocked_reason\)/);
  assert.match(login, /await supabase\.auth\.signOut\(\)/);
  assert.match(login, /router\.replace\(`\/akun-diblokir\$\{reason\}`\)/);

  const blocked = read('src/app/akun-diblokir/page.tsx');
  assert.match(blocked, /Akun Diblokir/);
  assert.match(blocked, /blocked_reason/);
  assert.match(blocked, /searchParams/);
  assert.match(blocked, /ForceSignOut/);
  assert.match(blocked, /getBusinessIdentity/);
  assert.match(blocked, /Alasan Blokir/);

  const forceSignOut = read('src/app/akun-diblokir/ForceSignOut.tsx');
  assert.match(forceSignOut, /auth\.signOut\(\)/);

  // Top Up adalah jalur transaksi langsung (bukan RPC) yang juga harus ditolak.
  const topup = read('src/app/api/topup/route.ts');
  assert.match(topup, /account_status === "BLOCKED"/);
  assert.match(topup, /ACCOUNT_BLOCKED/);
});
