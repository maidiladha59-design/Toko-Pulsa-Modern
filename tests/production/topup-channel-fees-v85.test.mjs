import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

// Unit test nyata: lib murni tanpa import dijalankan langsung oleh Node 24
// (type-stripping bawaan), jadi logika perhitungan diuji, bukan cuma teksnya.
const { calculateTopupFee, toChannelFeeInput, FEE_FORMULA_VERSION } = await import(
  pathToFileURL(path.join(process.cwd(), 'src/lib/topup-fee.ts')).href
);

const baseChannel = {
  channel_code: 'qris',
  label: 'QRIS',
  channel_group: 'QRIS',
  is_active: true,
  gateway_fee_type: 'flat',
  gateway_fee_flat: 0,
  gateway_fee_percent: 0,
  gateway_fee_tax_percent: 0,
  margin_type: 'flat',
  margin_flat: 0,
  margin_percent: 0,
  min_amount: null,
  max_amount: null,
  customer_note: null,
};

test('v85 unit: biaya flat saja', () => {
  const r = calculateTopupFee({ ...baseChannel, gateway_fee_type: 'flat', gateway_fee_flat: 1500, margin_type: 'flat', margin_flat: 500 }, 50000);
  assert.ok(r.ok);
  assert.equal(r.saldo_masuk, 50000);
  assert.equal(r.biaya_gateway, 1500);
  assert.equal(r.biaya_admin, 500);
  assert.equal(r.total_biaya, 2000);
  assert.equal(r.total_bayar, 52000);
});

test('v85 unit: biaya persen saja', () => {
  const r = calculateTopupFee({ ...baseChannel, gateway_fee_type: 'percent', gateway_fee_percent: 1.5, margin_type: 'percent', margin_percent: 0.5 }, 10000);
  assert.ok(r.ok);
  assert.equal(r.biaya_gateway, 150);
  assert.equal(r.biaya_admin, 50);
  assert.equal(r.total_bayar, 10200);
});

test('v85 unit: biaya flat + persen', () => {
  const r = calculateTopupFee({ ...baseChannel, gateway_fee_type: 'flat_percent', gateway_fee_flat: 1000, gateway_fee_percent: 0.7, margin_type: 'flat_percent', margin_flat: 500, margin_percent: 0.2 }, 100000);
  assert.ok(r.ok);
  assert.equal(r.biaya_gateway, 1700);
  assert.equal(r.biaya_admin, 700);
  assert.equal(r.total_biaya, 2400);
  assert.equal(r.total_bayar, 102400);
});

test('v85 unit: pembulatan ke atas ke rupiah utuh (tanpa desimal)', () => {
  const r = calculateTopupFee({ ...baseChannel, gateway_fee_type: 'percent', gateway_fee_percent: 0.7 }, 12345);
  assert.ok(r.ok);
  assert.equal(r.biaya_gateway, 87); // 12345 * 0.7% = 86.415 -> 87
  assert.ok(Number.isInteger(r.biaya_gateway) && Number.isInteger(r.biaya_admin) && Number.isInteger(r.total_bayar));
});

test('v85 unit: pajak biaya gateway ikut dibulatkan ke atas', () => {
  const r = calculateTopupFee({ ...baseChannel, gateway_fee_type: 'flat', gateway_fee_flat: 1000, gateway_fee_tax_percent: 10 }, 50000);
  assert.ok(r.ok);
  assert.equal(r.biaya_gateway, 1100);
  assert.equal(r.total_bayar, 51100);
});

test('v85 unit: nominal di bawah minimum ditolak', () => {
  const r = calculateTopupFee({ ...baseChannel, min_amount: 10000 }, 5000);
  assert.ok(!r.ok);
  assert.equal(r.code, 'BELOW_MIN');
});

test('v85 unit: nominal di atas maksimum ditolak', () => {
  const r = calculateTopupFee({ ...baseChannel, max_amount: 100000 }, 200000);
  assert.ok(!r.ok);
  assert.equal(r.code, 'ABOVE_MAX');
});

test('v85 unit: channel nonaktif ditolak dengan pesan ramah', () => {
  const r = calculateTopupFee({ ...baseChannel, is_active: false }, 50000);
  assert.ok(!r.ok);
  assert.equal(r.code, 'CHANNEL_INACTIVE');
  assert.ok(r.error.length > 10);
});

test('v85 unit: formula_version ikut dikembalikan dan mapper baris DB menormalkan numeric string', () => {
  const r = calculateTopupFee(baseChannel, 25000);
  assert.ok(r.ok);
  assert.equal(r.formula_version, FEE_FORMULA_VERSION);
  const mapped = toChannelFeeInput({ ...baseChannel, gateway_fee_percent: '0.7', min_amount: '10000' });
  assert.equal(mapped.gateway_fee_percent, 0.7);
  assert.equal(mapped.min_amount, 10000);
});

test('v85 migration: tabel, RLS admin-only, snapshot tarif, dan seed 0', () => {
  const sql = read('supabase/migrations_v85_payment_channel_fees.sql');
  for (const needle of ['payment_channel_fees', 'channel_code', 'gateway_fee_tax_percent', 'margin_type', 'customer_note', 'updated_by', 'payment_channel_fees_admin_write', 'is_admin()', 'revoke all on public.payment_channel_fees', 'add column if not exists fee_snapshot jsonb', 'on conflict(channel_code) do nothing']) {
    assert.ok(sql.toLowerCase().includes(needle.toLowerCase()), `migration harus memuat: ${needle}`);
  }
  // Pelanggan TIDAK boleh membaca tabel langsung: tidak ada grant select anon.
  assert.doesNotMatch(sql, /grant select on public\.payment_channel_fees to anon/);
  // Seed awal bernilai 0 semua (tidak menebak tarif Midtrans).
  assert.match(sql, /'bca_va', 'BCA Virtual Account', 'Virtual Account', true/);
});

test('v85 preflight: migration terdaftar', () => {
  const script = read('scripts/migration-preflight.mjs');
  assert.match(script, /migrations_v85_payment_channel_fees\.sql/);
  assert.match(script, /\['v85',/);
});

test('v85 route topup: server menghitung ulang, snapshot disimpan, item_details Midtrans', () => {
  const route = read('src/app/api/topup/route.ts');
  assert.match(route, /from\("payment_channel_fees"\)/);
  assert.match(route, /calculateTopupFee\(toChannelFeeInput\(channelRow\), amount\)/);
  assert.match(route, /fee_snapshot/);
  assert.match(route, /formula_version: FEE_FORMULA_VERSION/);
  assert.match(route, /name: "Biaya Layanan Channel"/);
  assert.match(route, /name: "Top Up Saldo"/);
  assert.match(route, /name: "Biaya Admin"/);
  // Mesin lama tetap ada sebagai cadangan pra-v85.
  assert.match(route, /getActiveTiers/);
  assert.match(route, /findTierFee/);
  const lib = read('src/lib/midtrans.ts');
  assert.match(lib, /itemDetails/);
  assert.match(lib, /GATEWAY_ITEM_TOTAL_MISMATCH/);
});

test('v85 preview endpoint: rincian biaya lewat server, bukan tabel langsung', () => {
  const preview = read('src/app/api/topup/preview/route.ts');
  assert.match(preview, /calculateTopupFee/);
  assert.match(preview, /CHANNEL_CONFIG_UNAVAILABLE/);
  assert.match(preview, /saldo_masuk/);
  assert.match(preview, /biaya_gateway/);
  assert.match(preview, /biaya_admin/);
  assert.match(preview, /total_bayar/);
  assert.match(preview, /customer_note/);
  const methods = read('src/app/api/payment-methods/route.ts');
  assert.match(methods, /payment_channel_fees/);
  assert.match(methods, /is_active/);
});

test('v85 halaman topup: total persis dibayar, tanpa teks perkiraan', () => {
  const page = read('src/app/wallet/topup/page.tsx');
  assert.doesNotMatch(page, /Perkiraan Total/);
  assert.doesNotMatch(page, /Total final akan ditampilkan di langkah berikutnya/);
  assert.match(page, /topup\/preview/);
  assert.match(page, /Biaya layanan channel/);
  assert.match(page, /Total bayar/);
  assert.match(page, /customer_note/);
  // Cadangan pra-v85 tetap dipakai dengan mesin tier lama.
  assert.match(page, /\{formatRupiah\(amount\+adminFee\)\}/);
});

test('v85 admin: API, audit, simulator, halaman, dan menu', () => {
  const api = read('src/app/api/admin/payment-channel-fees/route.ts');
  assert.match(api, /payment_channel_fee_update/);
  assert.match(api, /before/);
  assert.match(api, /after/);
  assert.match(api, /audit_logs/);
  assert.match(api, /laba_bersih_estimasi/);
  assert.match(api, /STAFF/);
  const page = read('src/app/admin/payment-channel-fees/page.tsx');
  assert.match(page, /Biaya per Channel/);
  assert.match(page, /Simulator/);
  assert.match(page, /api\/admin\/payment-channel-fees/);
  const sidebar = read('src/app/admin/AdminSidebar.tsx');
  assert.match(sidebar, /\/admin\/payment-channel-fees/);
  assert.match(sidebar, /Biaya Channel/);
});
