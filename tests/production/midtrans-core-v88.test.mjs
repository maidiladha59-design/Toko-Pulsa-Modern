import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const lib = read('src/lib/midtrans.ts');

// Modul murni (tanpa import Next/Supabase) dijalankan langsung oleh Node 24
// (type-stripping bawaan), jadi kontrak inti diuji sungguhan, bukan cuma teksnya.
const ORIGINAL_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
function restoreServerKey() {
  if (ORIGINAL_SERVER_KEY === undefined) delete process.env.MIDTRANS_SERVER_KEY;
  else process.env.MIDTRANS_SERVER_KEY = ORIGINAL_SERVER_KEY;
}
const midtrans = await import(pathToFileURL(path.join(process.cwd(), 'src/lib/midtrans.ts')).href);

// =========================================================
// Unit test — kontrak inti dijalankan sungguhan
// =========================================================

test('v88 unit: verifySignature mengikuti rumus resmi SHA512(order_id+status_code+gross_amount+ServerKey)', async () => {
  const crypto = await import('node:crypto');
  process.env.MIDTRANS_SERVER_KEY = 'kunci-unit-test-bukan-kunci-nyata';
  try {
    const orderId = 'INV-20261021-ABCDEF12';
    const statusCode = '200';
    const grossAmount = '15750.00';
    const expected = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`)
      .digest('hex');
    assert.equal(
      midtrans.verifySignature({ orderId, statusCode, grossAmount, signatureKey: expected }),
      true,
      'signature benar harus lolos'
    );
    assert.equal(
      midtrans.verifySignature({ orderId, statusCode, grossAmount, signatureKey: 'deadbeef' }),
      false,
      'signature salah harus ditolak'
    );
    assert.equal(
      midtrans.verifySignature({ orderId, statusCode, grossAmount: '99999.00', signatureKey: expected }),
      false,
      'gross_amount yang diubah harus menihilkan signature'
    );
    assert.equal(
      midtrans.verifySignature({ orderId: 'LAIN', statusCode, grossAmount, signatureKey: expected }),
      false,
      'order_id yang diubah harus menihilkan signature'
    );
  } finally {
    restoreServerKey();
  }
});

test('v88 unit: verifySignature menolak saat kredensial belum diset', () => {
  delete process.env.MIDTRANS_SERVER_KEY;
  try {
    assert.equal(
      midtrans.verifySignature({ orderId: 'A', statusCode: '200', grossAmount: '1000', signatureKey: 'x' }),
      false
    );
  } finally {
    restoreServerKey();
  }
});

test('v88 unit: createCharge tanpa kredensial mengembalikan error terstruktur, bukan throw', async () => {
  delete process.env.MIDTRANS_SERVER_KEY;
  try {
    const r = await midtrans.createCharge({ orderId: 'INV-UNIT-1', grossAmount: 10000, paymentType: 'qris' });
    assert.equal(r.success, false);
    assert.equal(r.code, 'NOT_CONFIGURED');
    assert.ok(r.message_id.length > 10, 'message_id harus pesan ramah');
    assert.ok(r.message_debug.length > 0, 'message_debug harus detail teknis untuk log');
  } finally {
    restoreServerKey();
  }
});

test('v88 unit: createCharge menolak input tidak valid secara terstruktur (tidak 500/502)', async () => {
  process.env.MIDTRANS_SERVER_KEY = 'kunci-unit-test-bukan-kunci-nyata';
  try {
    const zero = await midtrans.createCharge({ orderId: 'INV-UNIT-1', grossAmount: 0, paymentType: 'qris' });
    assert.equal(zero.success, false);
    assert.equal(zero.code, 'VALIDATION');

    const noBank = await midtrans.createCharge({ orderId: 'INV-UNIT-1', grossAmount: 10000, paymentType: 'bank_transfer' });
    assert.equal(noBank.success, false);
    assert.equal(noBank.code, 'VALIDATION');

    const noId = await midtrans.createCharge({ orderId: '', grossAmount: 10000, paymentType: 'qris' });
    assert.equal(noId.success, false);
    assert.equal(noId.code, 'VALIDATION');
  } finally {
    restoreServerKey();
  }
});

test('v88 unit: createCharge menolak item_details yang tidak cocok dengan gross_amount', async () => {
  process.env.MIDTRANS_SERVER_KEY = 'kunci-unit-test-bukan-kunci-nyata';
  try {
    const r = await midtrans.createCharge({
      orderId: 'INV-UNIT-1',
      grossAmount: 10000,
      paymentType: 'qris',
      itemDetails: [{ id: 'A', name: 'A', price: 5000 }],
    });
    assert.equal(r.success, false);
    assert.equal(r.code, 'VALIDATION');
  } finally {
    restoreServerKey();
  }
});

test('v88 unit: getTransactionStatus menolak id kosong secara terstruktur', async () => {
  process.env.MIDTRANS_SERVER_KEY = 'kunci-unit-test-bukan-kunci-nyata';
  try {
    const r = await midtrans.getTransactionStatus('');
    assert.equal(r.success, false);
    assert.equal(r.code, 'VALIDATION');
  } finally {
    restoreServerKey();
  }
});

test('v88 unit: wrapper lama melempar GATEWAY_ITEM_TOTAL_MISMATCH saat item_details tidak cocok', async () => {
  process.env.MIDTRANS_SERVER_KEY = 'kunci-unit-test-bukan-kunci-nyata';
  try {
    await assert.rejects(
      () =>
        midtrans.createGatewayTransaction('INV-UNIT-1', 10000, 'qris', {
          itemDetails: [{ id: 'A', name: 'A', price: 5000 }],
        }),
      /GATEWAY_ITEM_TOTAL_MISMATCH/
    );
  } finally {
    restoreServerKey();
  }
});

test('v88 unit: wrapper lama tetap melempar penanda yang dikenal route lama', async () => {
  delete process.env.MIDTRANS_SERVER_KEY;
  try {
    await assert.rejects(
      () => midtrans.createGatewayTransaction('INV-UNIT-1', 10000, 'qris'),
      /GATEWAY_NOT_CONFIGURED/
    );
    process.env.MIDTRANS_SERVER_KEY = 'kunci-unit-test-bukan-kunci-nyata';
    await assert.rejects(
      () => midtrans.createGatewayTransaction('INV-UNIT-1', 10000, 'gopay'),
      /GATEWAY_METHOD_NOT_SUPPORTED/
    );
    const gatewayError = new midtrans.GatewayError('TIMEOUT');
    assert.equal(gatewayError instanceof Error, true);
    assert.equal(gatewayError.kind, 'TIMEOUT');
  } finally {
    restoreServerKey();
  }
});

test('v88 unit: whitelist metode hanya QRIS + VA yang didukung Midtrans', () => {
  assert.deepEqual([...midtrans.GATEWAY_METHODS], ['qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va']);
  assert.equal(midtrans.isGatewayMethod('qris'), true);
  assert.equal(midtrans.isGatewayMethod('permata_va'), true);
  assert.equal(midtrans.isGatewayMethod('gopay'), false);
  assert.equal(midtrans.isGatewayMethod('cimb_niaga_va'), false);
  assert.equal(midtrans.GATEWAY_PROVIDER, 'midtrans');
  assert.equal(midtrans.isGatewayConfigured(), Boolean(ORIGINAL_SERVER_KEY));
});

test('v88 unit: isGatewayFailedStatus mengenali semua status gagal', () => {
  for (const s of ['canceled', 'cancelled', 'expired', 'failed']) {
    assert.equal(midtrans.isGatewayFailedStatus(s), true, s);
  }
  assert.equal(midtrans.isGatewayFailedStatus('pending'), false);
  assert.equal(midtrans.isGatewayFailedStatus(null), false);
});

// =========================================================
// Kontrak statis — struktur charge & pemetaan error per dokumentasi resmi
// =========================================================

test('v88 statis: API inti (createCharge/getTransactionStatus/verifySignature) diekspor', () => {
  assert.match(lib, /export async function createCharge\(/);
  assert.match(lib, /export async function getTransactionStatus\(/);
  assert.match(lib, /export function verifySignature\(/);
  assert.match(lib, /\/v2\/charge/);
  assert.match(lib, /\/v2\/\$\{encodeURIComponent\(txnId\)\}\/status/);
  assert.match(lib, /AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/);
});

test('v88 statis: Permata memakai payment_type "permata" TANPA bank_transfer (perbaikan bug)', () => {
  assert.match(lib, /permata_va: \{ paymentType: "permata" \}/);
  assert.doesNotMatch(lib, /bank["']?\s*:\s*["']permata["']/, 'permata bukan bank_transfer');
  assert.match(lib, /body\.bank_transfer = \{ bank \}/);
  assert.match(lib, /transaction_details: \{ order_id: orderId, gross_amount: grossAmount \}/);
  assert.match(lib, /payment_type: request\.paymentType/);
});

test('v88 statis: semua status_code Midtrans dipetakan, 202 = denied', () => {
  for (const pin of [
    '400: "VALIDATION"',
    '401: "AUTH_INVALID"',
    '402: "CHANNEL_NOT_ACTIVATED"',
    '404: "NOT_FOUND"',
    '406: "DUPLICATE_ORDER"',
    '407: "TRANSACTION_EXPIRED"',
    '410: "ACCOUNT_BLOCKED"',
    '429: "RATE_LIMITED"',
  ]) {
    assert.ok(lib.includes(pin), `STATUS_CODE_KEY harus memuat: ${pin}`);
  }
  assert.match(lib, /numericBodyCode === 202 \|\| numericBodyCode >= 400/);
  assert.match(lib, /STATUS_CODE_KEY\[numericBodyCode \?\? -1\]/);
});

test('v88 statis: pesan pelanggan ramah bahasa Indonesia, istilah teknis hanya di message_debug', () => {
  assert.match(lib, /message_id: "Metode pembayaran ini sedang tidak tersedia, silakan pilih metode lain\." \}/);
  assert.match(lib, /message_id: "Transaksi duplikat, coba lagi\." \}/);
  assert.match(lib, /message_id: "Transaksi sudah kedaluwarsa\." \}/);
  assert.match(lib, /message_debug = detail teknis untuk log server/);
  // Pesan teknis Midtrans hanya boleh hidup di sisi debug/log, tidak ke pelanggan.
  assert.match(lib, /status_message=\$\{String\(json\.status_message\)\.slice\(0, 200\)\}/);
});

test('v88 statis: Idempotency-Key opsional, dilewati untuk Permata, dibatasi 46 karakter', () => {
  assert.match(lib, /request\.paymentType === "permata"/);
  assert.match(lib, /key\.length > 46/);
  assert.match(lib, /"Idempotency-Key": init\.idempotencyKey/);
});

test('v88 statis: kredensial hanya dari env, tidak ada kunci hardcoded', () => {
  assert.match(lib, /process\.env\.MIDTRANS_SERVER_KEY/);
  assert.match(lib, /process\.env\.MIDTRANS_CLIENT_KEY/);
  assert.match(lib, /process\.env\.MIDTRANS_IS_PRODUCTION/);
  assert.match(lib, /https:\/\/api\.midtrans\.com/);
  assert.match(lib, /https:\/\/api\.sandbox\.midtrans\.com/);
  assert.doesNotMatch(lib, /SB-Mid-server|Mid-server-/);
});

test('v88 statis: lapisan kompatibilitas lama tetap ada untuk route yang belum dimigrasi', () => {
  for (const name of [
    'createGatewayTransaction',
    'getGatewayTransactionDetail',
    'verifyGatewayWebhookSignature',
    'extractGatewayPaymentNumber',
    'isGatewayFailedStatus',
    'isGatewayMethod',
    'isGatewayConfigured',
    'GatewayError',
    'GATEWAY_PROVIDER',
    'GATEWAY_METHODS',
    'GATEWAY_ITEM_TOTAL_MISMATCH',
  ]) {
    assert.ok(lib.includes(name), `midtrans.ts harus memuat: ${name}`);
  }
  assert.match(lib, /class GatewayError extends Error/);
});
