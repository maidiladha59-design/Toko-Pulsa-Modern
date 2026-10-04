import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MIGRATION = 'supabase/migrations_v76_split_bill.sql';
const NEW_TABLES = ['payment_requests', 'split_bills', 'split_bill_participants'];

test('v76 migration aman dijalankan ulang (idempotent) dan membuat tabel Split Bill', () => {
  const sql = read(MIGRATION);
  for (const t of NEW_TABLES) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${esc(t)}\\b`, 'i'), t);
  }
  assert.match(sql, /create index if not exists payment_requests_payer_created_idx/);
  assert.match(sql, /create index if not exists payment_requests_requester_created_idx/);
  assert.match(sql, /create index if not exists split_bills_creator_created_idx/);
  assert.match(sql, /create index if not exists split_bill_participants_user_idx/);
  assert.ok((sql.match(/create unique index if not exists/g) || []).length >= 1, 'unique index idempotent');
  assert.match(sql, /on conflict \(event_key\) do nothing/);
});

test('v76 constraint inti: satu permintaan per peserta, anti bayar diri, bagian positif', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /check \(requester_id <> payer_id\)/i);
  assert.match(sql, /check \(status in \('PENDING','PAID'\)\)/i);
  assert.match(sql, /check \(status in \('ACTIVE','COMPLETED'\)\)/i);
  assert.match(sql, /check \(split_mode in \('EQUAL','CUSTOM'\)\)/i);
  assert.match(sql, /check \(char_length\(btrim\(title\)\) between 3 and 100\)/i);
  assert.match(sql, /check \(total_amount > 0\)/i);
  assert.match(sql, /check \(share_amount > 0\)/i);
  assert.match(sql, /unique \(bill_id, user_id\)/i);
  assert.match(sql, /payment_request_id uuid not null unique references public\.payment_requests\(id\)/i);
  // Satu permintaan bayar per peserta per tagihan (partial unique index).
  assert.match(sql, /create unique index if not exists payment_requests_split_bill_unique/i);
  assert.match(sql, /where reference_type = 'SPLIT_BILL'/i);
});

test('v76 semua tabel baru mengaktifkan RLS dan di-revoke dari anon', () => {
  const sql = read(MIGRATION);
  for (const t of NEW_TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${esc(t)} enable row level security`, 'i'), t);
    assert.match(sql, new RegExp(`revoke all on public\\.${esc(t)} from anon, authenticated`, 'i'), t);
  }
  // Peserta hanya melihat tagihan yang melibatkan mereka.
  assert.match(sql, /split_bills_select_involved_or_admin/);
  assert.match(sql, /creator_id = auth\.uid\(\)/);
  assert.match(sql, /p\.bill_id = split_bills\.id and p\.user_id = auth\.uid\(\)/);
  assert.match(sql, /payment_requests_select_involved_or_admin/);
  assert.match(sql, /requester_id = auth\.uid\(\) or payer_id = auth\.uid\(\) or public\.is_admin\(\)/);
  for (const p of ['payment_requests_select_involved_or_admin', 'split_bills_select_involved_or_admin', 'split_bill_participants_select_involved_or_admin']) {
    assert.match(sql, new RegExp(`drop policy if exists "${p}"`), p);
  }
});

test('v76 RPC Split Bill diberikan hanya ke authenticated', () => {
  const sql = read(MIGRATION);
  const fns = [
    'create_split_bill(text, bigint, text, jsonb)',
    'get_my_split_bills()',
    'get_split_bill(uuid)',
    'pay_split_bill_share(uuid, text)',
    'send_split_bill_reminder(uuid, uuid)',
  ];
  for (const fn of fns) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${esc(fn)} to authenticated;`), fn);
    assert.match(sql, new RegExp(`revoke all on function public\\.${esc(fn)} from public, anon;`), fn);
    assert.match(sql, new RegExp(`create or replace function public\\.${esc(fn.replace(/\(.*$/, ''))}\\(`), fn);
  }
});

test('v76 pembagian integer murni: sisa dibebankan ke peserta pertama', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /v_base := p_total_amount \/ v_count;/);
  assert.match(sql, /v_remainder := p_total_amount - v_base \* v_count;/);
  assert.match(sql, /v_share := v_base \+ \(case when v_i = 0 then v_remainder else 0 end\);/);
  assert.ok(!/\d+\.\d+/.test(sql.replace(/--[^\n]*/g, '').replace(/'(?:[^']|'')*'/g, "''")), 'tidak ada literal float pada logika nominal');

  const utils = read('src/lib/splitbill/utils.ts');
  assert.match(utils, /Math\.floor\(totalAmount \/ count\)/);
  assert.match(utils, /totalAmount - Math\.floor\(totalAmount \/ count\) \* count/);
  assert.match(utils, /base \+ \(i === 0 \? remainder : 0\)/);
});

test('v76 CUSTOM: jumlah bagian wajib sama dengan total tagihan', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /coalesce\(sum\(\(x ->> 'share_amount'\)::bigint\), 0\) from jsonb_array_elements\(p_participants\) x\) <> p_total_amount/);
  assert.match(sql, /raise exception 'SHARES_MISMATCH';/);
  assert.match(sql, /raise exception 'DUPLICATE_PARTICIPANT';/);
  assert.match(sql, /raise exception 'SELF_PARTICIPANT';/);
  assert.match(sql, /raise exception 'PARTICIPANT_NOT_FOUND';/);

  const schemas = read('src/lib/splitbill/schemas.ts');
  assert.match(schemas, /mode: z\.enum\(\["EQUAL", "CUSTOM"\]\)/);
  assert.match(schemas, /\.min\(1\)\s*\.max\(20\)/);
  assert.match(schemas, /Jumlah bagian \(\$\{sum\}\) harus sama dengan total tagihan/);
});

test('v76 uang HANYA berpindah lewat create_wallet_transfer dalam satu transaksi', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /v_transfer_id := public\.create_wallet_transfer\(/);
  // Tidak ada penulisan saldo langsung di migrasi ini.
  assert.doesNotMatch(sql, /update public\.wallets\b/);
  assert.doesNotMatch(sql, /update wallets\b/);
  // Idempotency retry: key sama diputar ulang tanpa transfer kedua.
  assert.match(sql, /where sender_id = auth\.uid\(\) and idempotency_key = p_idempotency_key/);
  assert.match(sql, /raise exception 'IDEMPOTENCY_KEY_REUSED';/);
  // Kunci baris berurutan supaya pembayaran paralel tidak lolos bersamaan.
  assert.ok((sql.match(/for update/g) || []).length >= 3, 'kunci bill + request (bayar) + peserta (ingatkan)');
  assert.match(sql, /where id = v_request\.id and status = 'PENDING'/);
});

test('v76 tagihan otomatis SELESAI saat semua peserta membayar (atomik)', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /set status = 'COMPLETED', completed_at = now\(\)/);
  assert.match(sql, /where id = p_bill_id and status = 'ACTIVE'/);
  assert.match(sql, /and not exists \(\s*select 1 from public\.split_bill_participants p\s*join public\.payment_requests r on r\.id = p\.payment_request_id\s*where p\.bill_id = p_bill_id and r\.status <> 'PAID'/);
  assert.match(sql, /'splitbill\.completed', 'split_bill'/);
});

test('v76 audit log: created, paid, reminder (+ transfer.sent otomatis dari v75)', () => {
  const sql = read(MIGRATION);
  for (const action of ['splitbill.created', 'splitbill.paid', 'splitbill.completed', 'splitbill.reminder']) {
    assert.ok(sql.includes(`'${action}'`), action);
  }
  assert.ok((sql.match(/insert into public\.audit_logs/g) || []).length >= 4, 'audit untuk semua aksi RPC');
});

test('v76 pengingat dibatasi 1x per jam per peserta (kunci baris + waktu)', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /interval '1 hour'/);
  assert.match(sql, /raise exception 'REMINDER_TOO_FREQUENT';/);
  assert.match(sql, /set last_reminded_at = now\(\)/);
  assert.match(sql, /where bill_id = p_bill_id and user_id = p_participant_user_id for update/);
  assert.match(sql, /and r\.status = 'PENDING'/);
});

test('v76 detail tagihan menyembunyikan keberadaan tagihan dari orang luar', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /raise exception 'BILL_NOT_FOUND';/);
  assert.match(sql, /v_is_creator := v_bill\.creator_id = auth\.uid\(\);/);
  assert.match(sql, /not v_is_creator and not v_is_admin and not exists \(/);
  // Status pembayaran peserta bersumber dari payment_requests (satu sumber kebenaran).
  assert.match(sql, /join public\.payment_requests r on r\.id = p\.payment_request_id/);
  assert.match(sql, /'status', r\.status/);
  assert.match(sql, /'collected_amount', \(select coalesce\(sum\(r\.amount\), 0\)::bigint/);
});

test('v76 template notifikasi SPLITBILL disemai idempotent + terdaftar di engine', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /\('SPLITBILL_INVITED', 'Tagihan Patungan/);
  assert.match(sql, /\('SPLITBILL_REMINDER', 'Pengingat Tagihan/);
  assert.match(sql, /\('SPLITBILL_COMPLETED', 'Tagihan Lunas/);
  const engine = read('src/lib/notification-engine.ts');
  assert.match(engine, /'SPLITBILL_INVITED' \| 'SPLITBILL_REMINDER' \| 'SPLITBILL_COMPLETED'/);
  assert.match(engine, /eventKey\.startsWith\('SPLITBILL_'\)/);
});

test('v76 POST /api/split-bills: Zod + rate limit + undangan per peserta', () => {
  const s = read('src/app/api/split-bills/route.ts');
  assert.match(s, /createSplitBillSchema\.safeParse/);
  assert.match(s, /splitbill_create:\$\{user\.id\}/);
  assert.match(s, /supabase\.rpc\("create_split_bill"/);
  assert.match(s, /eventKey: "SPLITBILL_INVITED"/);
  assert.match(s, /url: `\/split-bill\/\$\{billId\}`/);
  assert.doesNotMatch(s, /from\("wallets"\)/);
});

test('v76 POST /api/split-bills/[id]/pay: PIN, replay idempotent, notifikasi dua arah', () => {
  const s = read('src/app/api/split-bills/[id]/pay/route.ts');
  assert.match(s, /paySplitBillSchema\.safeParse/);
  assert.match(s, /verifyTransactionPin\(user\.id, pin\)/);
  assert.match(s, /PIN_NOT_SET/);
  assert.match(s, /PIN_LOCKED/);
  assert.match(s, /splitbill_pay:\$\{user\.id\}/);
  assert.match(s, /consumeRateLimit\(rateKeyHash, 10, 15 \* 60\)/);
  assert.match(s, /\.eq\("sender_id", user\.id\)/);
  assert.match(s, /\.eq\("idempotency_key", idempotency_key\)/);
  assert.match(s, /supabase\.rpc\("pay_split_bill_share"/);
  assert.match(s, /ALREADY_PAID/);
  assert.match(s, /BILL_NOT_ACTIVE/);
  assert.match(s, /IDEMPOTENCY_KEY_REUSED/);
  assert.match(s, /eventKey: "TRANSFER_RECEIVED"/);
  assert.match(s, /eventKey: "TRANSFER_SENT"/);
  assert.match(s, /eventKey: "SPLITBILL_COMPLETED"/);
  // Saldo tidak pernah disentuh dari route: semua lewat RPC pay_split_bill_share.
  assert.doesNotMatch(s, /from\("wallets"\)/);
});

test('v76 POST /api/split-bills/[id]/remind: creator-only via RPC + rate limit ganda', () => {
  const s = read('src/app/api/split-bills/[id]/remind/route.ts');
  assert.match(s, /remindParticipantSchema\.safeParse/);
  assert.match(s, /splitbill_remind:\$\{user\.id\}/);
  assert.match(s, /supabase\.rpc\("send_split_bill_reminder"/);
  assert.match(s, /REMINDER_TOO_FREQUENT/);
  assert.match(s, /eventKey: "SPLITBILL_REMINDER"/);
});

test('v76 GET /api/split-bills & detail memakai RPC (tanpa akses tabel langsung)', () => {
  const list = read('src/app/api/split-bills/route.ts');
  assert.match(list, /rpc\("get_my_split_bills"\)/);
  const detail = read('src/app/api/split-bills/[id]/route.ts');
  assert.match(detail, /rpc\("get_split_bill"/);
  assert.match(detail, /BILL_NOT_FOUND/);
});

test('v76 UI split bill terpasang: daftar+buat, detail, bayar, ingatkan', () => {
  for (const f of [
    'src/app/split-bill/page.tsx',
    'src/app/split-bill/SplitBillClient.tsx',
    'src/app/split-bill/[id]/page.tsx',
    'src/app/split-bill/[id]/SplitBillDetailClient.tsx',
  ]) {
    assert.ok(exists(f), f);
  }

  const create = read('src/app/split-bill/SplitBillClient.tsx');
  assert.match(create, /calcEqualShares\(totalNumber, selected\.length\)/);
  assert.match(create, /equalSplitRemainder\(totalNumber, selected\.length\)/);
  assert.match(create, /dibebankan ke peserta pertama/);
  assert.match(create, /fetch\("\/api\/split-bills"/);
  assert.match(create, /fetch\(`\/api\/transfer\/search\?q=\$\{encodeURIComponent\(q\)\}`\)/);
  assert.match(create, /fetch\("\/api\/transfer\/contacts"\)/);

  const detail = read('src/app/split-bill/[id]/SplitBillDetailClient.tsx');
  assert.match(detail, /fetch\(`\/api\/split-bills\/\$\{billId\}`\)/);
  assert.match(detail, /fetch\(`\/api\/split-bills\/\$\{billId\}\/pay`/);
  assert.match(detail, /idempotency_key: idemRef\.current/);
  assert.match(detail, /REMINDER_COOLDOWN_MS = 60 \* 60 \* 1000/);
  assert.match(detail, /fetch\(`\/api\/split-bills\/\$\{billId\}\/remind`/);
  assert.match(detail, /collected_amount/);
});

test('v76 navigasi Split Bill terpasang di Navbar (desktop & mobile)', () => {
  const navbar = read('src/components/Navbar.tsx');
  assert.match(navbar, /\["\/split-bill","🧾 Split Bill"\]/);
  assert.ok((navbar.match(/\/split-bill/g) || []).length >= 2, 'link dropdown akun + menu mobile');
});

test('v76 terdaftar di migration preflight', () => {
  const preflight = read('scripts/migration-preflight.mjs');
  assert.match(preflight, /,55,73,75,76,77/);
  assert.match(preflight, /migrations_v76_split_bill\.sql/);
  assert.match(preflight, /pay_split_bill_share/);
  assert.match(preflight, /splitbill\.completed/);
});
