import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MIGRATION = 'supabase/migrations_v75_wallet_transfer_qr.sql';
const NEW_TABLES = ['transfer_settings', 'wallet_transfers', 'transfer_contacts', 'user_qr_tokens'];

test('v75 migration aman dijalankan ulang (idempotent) dan menambah enum TRANSFER', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /alter type public\.wallet_tx_type add value if not exists 'TRANSFER';/i);
  for (const t of NEW_TABLES) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${esc(t)}\\b`, 'i'), t);
  }
  assert.match(sql, /create index if not exists wallet_transfers_sender_created_idx/);
  assert.match(sql, /create index if not exists wallet_transfers_recipient_created_idx/);
  assert.ok((sql.match(/on conflict/g) || []).length >= 4, 'seed/upsert idempotent on conflict');
});

test('v75 constraint inti: idempotency per pengirim, total = amount + fee, anti transfer diri', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /unique \(sender_id, idempotency_key\)/i);
  assert.match(sql, /check \(total = amount \+ fee\)/i);
  assert.match(sql, /check \(sender_id <> recipient_id\)/i);
  assert.match(sql, /check \(user_id <> contact_user_id\)/i);
  assert.match(sql, /unique \(user_id, contact_user_id\)/i);
  assert.match(sql, /check \(char_length\(token\) = 64\)/i);
});

test('v75 semua tabel baru mengaktifkan RLS dan di-revoke dari anon', () => {
  const sql = read(MIGRATION);
  for (const t of NEW_TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${esc(t)} enable row level security`, 'i'), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${esc(t)} from anon, authenticated`, 'i'), t);
  }
});

test('v75 token QR & kontak favorit hanya lewat RPC security definer (tanpa policy)', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /Sengaja TANPA policy: baca\/tulis hanya lewat RPC security definer/);
  assert.match(sql, /Sengaja TANPA policy: token hanya dibaca\/ditulis lewat RPC security definer/);
  assert.match(sql, /drop policy if exists "transfer_settings_admin_read"/);
  assert.match(sql, /drop policy if exists "wallet_transfers_select_own_or_admin"/);
  assert.match(sql, /sender_id = auth\.uid\(\) or recipient_id = auth\.uid\(\) or public\.is_admin\(\)/);
});

test('v75 RPC transfer/resolve diberikan hanya ke authenticated', () => {
  const sql = read(MIGRATION);
  const fns = [
    'ensure_user_qr_token()',
    'regenerate_user_qr_token()',
    'resolve_qr_token(text)',
    'get_transfer_settings()',
    'list_transfer_contacts()',
    'add_transfer_contact(uuid, text)',
    'remove_transfer_contact(uuid)',
    'create_wallet_transfer(uuid, uuid, bigint, text, text)',
  ];
  for (const fn of fns) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${esc(fn)} to authenticated;`), fn);
    assert.match(sql, new RegExp(`revoke all on function public\\.${esc(fn)} from public, anon;`), fn);
  }
  assert.match(sql, /revoke all on function public\.generate_qr_token\(\) from public, anon, authenticated;/);
});

test('v75 create_wallet_transfer: ledger-only, bebas deadlock, idempotent, audit, limit Jakarta', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create or replace function public\.create_wallet_transfer\([\s\S]*?security definer set search_path = public, extensions/);
  // Idempotency di-scope ke pengirim yang sama
  assert.match(sql, /where sender_id = p_user_id and idempotency_key = p_idempotency_key;/);
  // Balapan request paralel: unique_violation -> pakai transfer yang sudah dibuat
  assert.match(sql, /exception when unique_violation then/);
  // Kunci dua wallet dengan urutan tetap (bebas deadlock)
  assert.match(sql, /if p_user_id::text < p_recipient_id::text then[\s\S]*?for update;[\s\S]*?for update;[\s\S]*?else[\s\S]*?for update;[\s\S]*?for update;[\s\S]*?end if;/);
  // Saldo hanya berubah lewat wallet ledger
  assert.match(sql, /update wallets set balance = balance - v_total/);
  assert.match(sql, /update wallets set balance = balance \+ p_amount/);
  assert.match(sql, /insert into wallet_transactions \(wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description\)/);
  assert.match(sql, /'TRANSFER', -v_total/);
  assert.match(sql, /'TRANSFER', p_amount/);
  // Audit log
  assert.match(sql, /insert into audit_logs \(actor_id, action, target_type, target_id, metadata\)/);
  assert.match(sql, /'transfer\.sent', 'wallet_transfer'/);
  // Limit harian/bulanan zona Asia/Jakarta
  assert.match(sql, /date_trunc\('day', now\(\) at time zone 'Asia\/Jakarta'\) at time zone 'Asia\/Jakarta'/);
  assert.match(sql, /date_trunc\('month', now\(\) at time zone 'Asia\/Jakarta'\) at time zone 'Asia\/Jakarta'/);
  assert.match(sql, /DAILY_LIMIT_EXCEEDED/);
  assert.match(sql, /MONTHLY_LIMIT_EXCEEDED/);
  assert.match(sql, /INSUFFICIENT_BALANCE/);
});

test('v75 biaya admin konsisten SQL <-> UI (ceil persen, round fixed)', () => {
  const sql = read(MIGRATION);
  const utils = read('src/lib/transfer/utils.ts');
  assert.match(sql, /v_fee := ceil\(p_amount \* v_settings\.fee_value \/ 100\.0\)::bigint;/);
  assert.match(sql, /v_fee := round\(v_settings\.fee_value\)::bigint;/);
  assert.match(utils, /Math\.ceil\(\(amount \* value\) \/ 100\)/);
  assert.match(utils, /Math\.round\(value\)/);
});

test('v75 template notifikasi TRANSFER_SENT & TRANSFER_RECEIVED disemai idempotent', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /\('TRANSFER_SENT', 'Transfer Berhasil/);
  assert.match(sql, /\('TRANSFER_RECEIVED', 'Saldo Masuk/);
  assert.match(sql, /on conflict \(event_key\) do nothing/);
  const engine = read('src/lib/notification-engine.ts');
  assert.match(engine, /'TRANSFER_SENT' \| 'TRANSFER_RECEIVED'/);
});

test('v75 POST /api/transfer: PIN, rate limit, replay idempotent, RPC atomik', () => {
  const s = read('src/app/api/transfer/route.ts');
  assert.match(s, /verifyTransactionPin\(user\.id, pin\)/);
  assert.match(s, /PIN_NOT_SET/);
  assert.match(s, /PIN_LOCKED/);
  assert.match(s, /transfer_send:\$\{user\.id\}/);
  assert.match(s, /consumeRateLimit\(rateKeyHash, 10, 15 \* 60\)/);
  assert.match(s, /\.eq\("sender_id", user\.id\)/);
  assert.match(s, /\.eq\("idempotency_key", idempotency_key\)/);
  assert.match(s, /supabase\.rpc\("create_wallet_transfer"/);
  assert.match(s, /eventKey: "TRANSFER_RECEIVED"/);
  assert.match(s, /eventKey: "TRANSFER_SENT"/);
  // Saldo tidak pernah disentuh dari route: semua lewat RPC create_wallet_transfer
  assert.doesNotMatch(s, /from\("wallets"\)/);
});

test('v75 pencarian penerima selalu ter-mask (tidak bocorkan email/telepon mentah)', () => {
  const s = read('src/app/api/transfer/search/route.ts');
  assert.match(s, /maskName\(displayName\)/);
  assert.match(s, /maskEmail\(found\.email\)/);
  assert.match(s, /maskPhone\(found\.phone\)/);
  assert.match(s, /transfer_search:\$\{user\.id\}/);
  assert.doesNotMatch(s, /email_masked: found\.email\b/);
});

test('v75 rute QR: resolve + regenerate lewat RPC dengan rate limit ketat', () => {
  const resolve = read('src/app/api/transfer/qr/resolve/route.ts');
  assert.match(resolve, /rpc\("resolve_qr_token"/);
  assert.match(resolve, /transfer_qr_resolve:\$\{user\.id\}/);
  const regen = read('src/app/api/transfer/qr/regenerate/route.ts');
  assert.match(regen, /rpc\("regenerate_user_qr_token"\)/);
  assert.match(regen, /transfer_qr_regen:\$\{user\.id\}/);
});

test('v75 rute kontak favorit & pengaturan memakai RPC (tanpa akses tabel langsung)', () => {
  const contacts = read('src/app/api/transfer/contacts/route.ts');
  assert.match(contacts, /rpc\("list_transfer_contacts"\)/);
  assert.match(contacts, /rpc\("add_transfer_contact"/);
  assert.match(contacts, /rpc\("remove_transfer_contact"/);
  const settings = read('src/app/api/transfer/settings/route.ts');
  assert.match(settings, /rpc\("get_transfer_settings"\)/);
});

test('v75 admin pengaturan transfer: hanya ADMIN/SUPER_ADMIN dan diaudit', () => {
  const s = read('src/app/api/admin/transfer-settings/route.ts');
  assert.match(s, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(profile\.role\)/);
  assert.match(s, /"transfer\.settings_update"/);
  assert.match(s, /audit_logs/);
});

test('v75 input transfer divalidasi Zod termasuk idempotency_key', () => {
  const s = read('src/lib/transfer/schemas.ts');
  assert.match(s, /recipient_id: z\.string\(\)\.uuid\(\)/);
  assert.match(s, /pin: z\.string\(\)\.min\(1\)/);
  assert.match(s, /idempotency_key: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(128\)/);
  assert.match(s, /note: z\.string\(\)\.trim\(\)\.max\(140\)\.optional\(\)/);
  assert.match(s, /regex\(\/\^\[a-f0-9\]\{64\}\$\/\)/);
});

test('v75 payload QR hanya berisi token publik 64 hex + nominal opsional', () => {
  const s = read('src/lib/transfer/qr.ts');
  assert.match(s, /PERSONAL_QR_PATH = "\/transfer-uang"/);
  assert.match(s, /\/\^\[a-f0-9\]\{64\}\$\//);
  assert.match(s, /qr=\$\{token\}/);
  assert.match(s, /amount=\$\{amount\}/);
});

test('v75 UI: form transfer, halaman QR, dan scan QR pribadi terpasang', () => {
  for (const f of [
    'src/app/transfer-uang/page.tsx',
    'src/app/transfer-uang/TransferForm.tsx',
    'src/app/transfer-uang/qr/page.tsx',
    'src/app/transfer-uang/qr/PersonalQrClient.tsx',
    'src/app/admin/transfers/page.tsx',
  ]) {
    assert.ok(exists(f), f);
  }

  const form = read('src/app/transfer-uang/TransferForm.tsx');
  assert.match(form, /fetch\("\/api\/transfer"/);
  assert.match(form, /idempotency_key: idemRef\.current/);

  const qrPage = read('src/app/transfer-uang/qr/page.tsx');
  assert.match(qrPage, /rpc\("ensure_user_qr_token"\)/);

  const scan = read('src/app/scan-qris/page.tsx');
  assert.match(scan, /parsePersonalQrPayload\(raw\)/);
  assert.match(scan, /\/transfer-uang\?qr=\$\{personal\.token\}/);

  const transferPage = read('src/app/transfer-uang/page.tsx');
  assert.match(transferPage, /isValidQrToken\(qrRaw\)/);
});

test('v75 navigasi & label TRANSFER terpasang di wallet, navbar, profil, admin', () => {
  assert.match(read('src/app/wallet/page.tsx'), /TRANSFER: "Transfer"/);
  assert.match(read('src/app/admin/AdminSidebar.tsx'), /"\/admin\/transfers"/);
  assert.match(read('src/components/Navbar.tsx'), /"\/transfer-uang\/qr"/);
  assert.match(read('src/app/profile/page.tsx'), /'\/transfer-uang\/qr'/);
  assert.match(read('src/app/transactions/wallet/[id]/page.tsx'), /TRANSFER: "Transfer Saldo"/);
});

test('v75 terdaftar di migration preflight', () => {
  const preflight = read('scripts/migration-preflight.mjs');
  assert.match(preflight, /75/);
  assert.match(preflight, /migrations_v75_wallet_transfer_qr\.sql/);
});
