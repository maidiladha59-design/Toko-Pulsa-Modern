import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

// Bank peninggalan gateway FR3 Newera yang tidak didukung Midtrans Core API.
const LEGACY = ['atm_bersama_va', 'artha_graha_va', 'cimb_niaga_va', 'maybank_va', 'bnc_va', 'sampoerna_va'];
// Metode yang resmi didukung Midtrans Core API: QRIS + VA bca/bni/bri/permata.
const SUPPORTED = ['qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va'];

test('v86 whitelist Midtrans hanya memuat metode yang benar-benar didukung', () => {
  const lib = read('src/lib/midtrans.ts');
  assert.match(lib, /export const GATEWAY_METHODS = \["qris", "bca_va", "bni_va", "bri_va", "permata_va"\] as const;/);
  for (const bank of LEGACY) assert.doesNotMatch(lib, new RegExp(`"${bank}"`), `GATEWAY_METHODS tidak boleh memuat ${bank}`);
  // Peta metode → struktur charge Midtrans (diperbarui v88 saat lib dibangun ulang):
  // bca/bni/bri memakai payment_type bank_transfer; permata memakai payment_type
  // "permata" (per dokumentasi resmi Midtrans — bukan bank_transfer).
  assert.match(lib, /bca_va: \{ paymentType: "bank_transfer", bank: "bca" \}/);
  assert.match(lib, /bni_va: \{ paymentType: "bank_transfer", bank: "bni" \}/);
  assert.match(lib, /bri_va: \{ paymentType: "bank_transfer", bank: "bri" \}/);
  assert.match(lib, /permata_va: \{ paymentType: "permata" \}/);
  // Permata tidak boleh dikirim sebagai bank_transfer.
  assert.doesNotMatch(lib, /bank["']?\s*:\s*["']permata["']/);
});

test('v86 /api/payment-methods menyaring metode di luar whitelist Midtrans', () => {
  const route = read('src/app/api/payment-methods/route.ts');
  assert.match(route, /import \{ isGatewayMethod \} from '@\/lib\/midtrans';/);
  // Filter whitelist jalan lebih dulu, sebelum filter is_active payment_channel_fees (v85).
  assert.match(route, /\(data\|\|\[\]\)\.filter\(\(m\)=>isGatewayMethod\(m\.provider_method\)\)/);
  assert.match(route, /payment_channel_fees/);
  assert.match(route, /isGatewayMethod\(m\.provider_method\)/);
  // Metode tetap diambil dari baris is_active=true saja.
  assert.match(route, /\.eq\('is_active',true\)/);
});

test('v86 pesan error topup tidak membocorkan istilah teknis ke pelanggan', () => {
  const route = read('src/app/api/topup/route.ts');
  // Kata "idempotency key" tidak boleh lagi tampil di pesan untuk pelanggan.
  assert.doesNotMatch(route, /idempotency key tidak valid/);
  assert.match(route, /Metode pembayaran ini sedang tidak tersedia, silakan pilih metode lain\./);
  assert.match(route, /METHOD_UNAVAILABLE/);
  // Kegagalan metode dibedakan dari kegagalan nominal.
  assert.match(route, /i\.path\[0\] === "method"/);
  assert.match(route, /Nominal Top Up tidak valid\./);
  // Detail teknis tetap dicatat di log server untuk debugging.
  assert.match(route, /console\.error\("\[topup\] input tidak valid"/);
  // Status 402 dari Midtrans juga memakai pesan ramah yang sama.
  assert.match(route, /midtransCode === 402.*sedang tidak tersedia/);
});

test('v86 migrasi pembersih hanya mengubah data, bukan skema', () => {
  const sql = read('supabase/migrations_v86_cleanup_legacy_va_methods.sql').toLowerCase();
  // Tidak ada perubahan struktur database.
  assert.doesNotMatch(sql, /create table/);
  assert.doesNotMatch(sql, /alter table/);
  assert.doesNotMatch(sql, /drop table/);
  assert.doesNotMatch(sql, /create policy/);
  assert.doesNotMatch(sql, /delete from/);
  assert.match(sql, /update public\.topup_payment_methods/);
  assert.match(sql, /set is_active = false/);
  assert.match(sql, /on conflict\(provider_method\) do nothing/);
  // Semua bank legacy disebut supaya dinonaktifkan.
  for (const bank of LEGACY) assert.ok(sql.includes(bank), `migrasi v86 harus menyebut ${bank}`);
  // Kelima metode Midtrans dipastikan tersedia.
  for (const code of SUPPORTED) assert.ok(sql.includes(`'${code}'`), `migrasi v86 harus memuat ${code}`);
  assert.match(sql, /not in \('qris','bca_va','bni_va','bri_va','permata_va'\)/);
});

test('v86 migrasi pembersih terdaftar di preflight', () => {
  const script = read('scripts/migration-preflight.mjs');
  assert.match(script, /migrations_v86_cleanup_legacy_va_methods\.sql/);
  assert.match(script, /83,85,86,87\]/);
});

test('v86 panel admin tidak menawarkan bank legacy sebagai metode Top Up', () => {
  const page = read('src/app/admin/payment-settings/page.tsx');
  for (const bank of LEGACY) assert.doesNotMatch(page, new RegExp(bank), `panel admin tidak boleh memuat ${bank}`);
  for (const code of SUPPORTED) assert.ok(page.includes(`'${code}'`), `panel admin harus memuat ${code}`);
});
