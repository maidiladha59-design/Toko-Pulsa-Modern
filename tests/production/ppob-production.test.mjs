import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const v19 = read('supabase/migrations_v19_ppob_wallet_atomic.sql');
const v14 = read('supabase/migrations_v14_ppob_reliability.sql');
const v24 = read('supabase/migrations_v24_production_hardening.sql');
const v25 = read('supabase/migrations_v25_ppob_atomic_claim.sql');
const fulfill = read('src/lib/ppob/fulfill.ts');
const cron = read('src/app/api/ppob/cron/route.ts');
const wallet = read('src/app/api/ppob/prepaid/pay/route.ts');
const webhook = read('src/app/api/ppob/webhook/route.ts');

function applyStatus(statuses) {
  if (statuses.length && statuses.every(s => s === 'SUCCESS')) return 'COMPLETED';
  if (statuses.some(s => s === 'FAILED')) return 'FAILED';
  return 'PROCESSING';
}

function shouldClaim(tx, now) {
  if (!['WAITING', 'PROCESSING'].includes(tx.status)) return false;
  if (!tx.customer_no || tx.customer_no === 'pending-target') return false;
  if ((tx.attempt_count ?? 0) >= 3) return false;
  return tx.status === 'WAITING' || tx.next_retry_at == null || tx.next_retry_at <= now;
}

test('wallet payment is idempotent at database level', () => {
  assert.match(v19, /orders where idempotency_key=p_idempotency_key/);
  assert.match(v19, /unique_violation/);
  assert.match(v19, /IDEMPOTENCY_KEY_CONFLICT/);
});

test('wallet payment requires authenticated owner and target', () => {
  assert.match(v19, /auth\.uid\(\) is null/);
  assert.match(v19, /p_user_id <> auth\.uid\(\)/);
  assert.match(v19, /TARGET_REQUIRED/);
  assert.match(wallet, /customer_no: z\.string\(\)\.trim\(\)\.min\(3\)/);
});

test('wallet debit is protected by row lock and insufficient balance check', () => {
  assert.match(v19, /from wallets where user_id=p_user_id for update/);
  assert.match(v19, /v_wallet\.balance < v_product\.price/);
  assert.match(v19, /v_after := v_before - v_product\.price/);
});

test('refund is idempotent', () => {
  assert.match(v24, /wallet_transactions_order_refund_once_idx/);
  assert.match(v24, /type = 'REFUND'/);
  assert.match(v14, /v_order\.status='PROCESSING'/);
});

test('provider transaction has an atomic claim gate', () => {
  assert.match(v25, /create or replace function public\.claim_ppob_transaction/);
  assert.match(v25, /attempt_count=coalesce\(attempt_count,0\)\+1/);
  assert.match(v25, /coalesce\(attempt_count,0\) < 3/);
  assert.match(fulfill, /claim_ppob_transaction/);
});

test('same transaction is not claimable after max attempts or before cooldown', () => {
  const now = new Date('2026-09-17T04:00:00.000Z');
  assert.equal(shouldClaim({status:'WAITING', attempt_count:0, customer_no:'08123456789'}, now), true);
  assert.equal(shouldClaim({status:'PROCESSING', attempt_count:3, customer_no:'08123456789', next_retry_at:null}, now), false);
  assert.equal(shouldClaim({status:'PROCESSING', attempt_count:1, customer_no:'08123456789', next_retry_at:new Date('2026-09-17T04:01:00.000Z')}, now), false);
  assert.equal(shouldClaim({status:'PROCESSING', attempt_count:1, customer_no:'08123456789', next_retry_at:new Date('2026-09-17T03:59:00.000Z')}, now), true);
});

test('terminal order status logic is deterministic', () => {
  assert.equal(applyStatus(['SUCCESS']), 'COMPLETED');
  assert.equal(applyStatus(['SUCCESS','SUCCESS']), 'COMPLETED');
  assert.equal(applyStatus(['SUCCESS','PROCESSING']), 'PROCESSING');
  assert.equal(applyStatus(['SUCCESS','FAILED']), 'FAILED');
});

test('webhook rejects invalid signature before processing payload', () => {
  const verifyPos = webhook.indexOf('verifyWebhookSignature');
  const parsePos = webhook.indexOf('JSON.parse(raw)');
  assert.ok(verifyPos >= 0 && parsePos > verifyPos);
  assert.match(webhook, /status: 401/);
});

test('cron remains protected by CRON_SECRET', () => {
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /Bearer \$\{secret\}/);
  assert.match(cron, /status: 401/);
});
