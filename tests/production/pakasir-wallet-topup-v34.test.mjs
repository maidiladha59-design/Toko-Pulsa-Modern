import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const route = read('src/app/api/topup/route.ts');
const webhook = read('src/app/api/payments/pakasir/webhook/route.ts');
const migration = read('supabase/migrations_v34_pakasir_wallet_topup.sql');
const page = read('src/app/wallet/topup/page.tsx');

 test('v34 automatic Pakasir wallet topup wiring exists', () => {
  assert.match(route, /createPakasirTransaction/);
  assert.match(route, /idempotency_key/);
  assert.match(route, /provider_order_id/);
  assert.match(webhook, /confirm_pakasir_topup/);
  assert.match(webhook, /getPakasirTransactionDetail/);
  assert.match(webhook, /TOPUP-/);
  assert.match(migration, /create or replace function public\.confirm_pakasir_topup/);
  assert.match(migration, /topups_idempotency_key_uidx/);
  assert.match(migration, /topups_provider_order_id_uidx/);
  assert.match(page, /Top Up Saldo Otomatis/);
  assert.doesNotMatch(page, /Upload Bukti Pembayaran/);
});
