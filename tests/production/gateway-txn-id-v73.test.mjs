import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v73 migration adds orders.gateway_txn_id and topups.provider_txn_id', () => {
  const sql = read('supabase/migrations_v73_gateway_txn_id.sql');
  assert.match(sql, /alter table public\.orders[\s\S]*add column if not exists gateway_txn_id text/i);
  assert.match(sql, /alter table public\.topups[\s\S]*add column if not exists provider_txn_id text/i);
});

test('v73 every order-creating gateway route stores FR3 NEWERA txn_id', () => {
  for (const f of [
    'src/app/api/checkout/gateway/route.ts',
    'src/app/api/checkout/qris/route.ts',
    'src/app/api/ppob/postpaid/pay/route.ts',
  ]) {
    const s = read(f);
    assert.match(s, /gateway_txn_id\s*:\s*payment\.txn_id/, f);
    assert.doesNotMatch(s, /payment\.payment_number/, `${f} still uses v1 payment_number`);
  }
});

test('v73 status polling, webhook and reconciliation use gateway_txn_id (never order_number)', () => {
  const status = read('src/app/api/orders/[id]/status/route.ts');
  assert.match(status, /getGatewayTransactionDetail\(order\.gateway_txn_id\)/);
  assert.doesNotMatch(status, /getGatewayTransactionDetail\(order\.gateway_reference/);
  const webhook = read('src/app/api/payments/fr3newera/webhook/route.ts');
  assert.match(webhook, /order\.gateway_txn_id/);
  const cron = read('src/app/api/reconciliation/cron/route.ts');
  assert.match(cron, /getGatewayTransactionDetail\(t\.provider_txn_id\)/);
  assert.match(cron, /getGatewayTransactionDetail\(o\.gateway_txn_id\)/);
  assert.doesNotMatch(cron, /getGatewayTransactionDetail\(t\.provider_order_id/);
});
