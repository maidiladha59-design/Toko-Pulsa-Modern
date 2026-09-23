import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const route = read('src/app/api/topup/route.ts');
const webhook = read('src/app/api/payments/fr3newera/webhook/route.ts');
const migration = read('supabase/migrations_v34_pakasir_wallet_topup.sql');
const page = read('src/app/wallet/topup/page.tsx');

test('v34 automatic FR3 NEWERA wallet topup wiring exists', () => {
  assert.match(route, /createGatewayTransaction/);
  assert.match(route, /idempotency_key/);
  assert.match(route, /provider_order_id/);
  assert.match(webhook, /confirm_gateway_topup/);
  assert.match(webhook, /getGatewayTransactionDetail/);
  assert.match(webhook, /provider_txn_id/);
  assert.match(migration, /create or replace function public\.confirm_pakasir_topup/);
  assert.match(migration, /topups_idempotency_key_uidx/);
  assert.match(migration, /topups_provider_order_id_uidx/);
  assert.match(page, /Top Up Saldo Otomatis/);
  assert.doesNotMatch(page, /Upload Bukti Pembayaran/);
});
