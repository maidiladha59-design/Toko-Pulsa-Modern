import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v45 migration hardens voucher redemption and loyalty awarding',()=>{
  const s=read('supabase/migrations_v45_production_hardening.sql');
  assert.match(s,/alter table public\.orders add column if not exists voucher_id/);
  assert.match(s,/alter table public\.orders add column if not exists discount_amount/);
  assert.match(s,/user_id=auth\.uid\(\)/);
  assert.match(s,/o\.status <> 'PENDING'/);
  assert.match(s,/p_discount bigint/);
  assert.match(s,/auth\.role\(\) <> 'service_role'/);
  assert.match(s,/grant execute on function public\.award_loyalty_points.*to service_role/);
});

test('v45 provides server-side voucher application before gateway payment',()=>{
  const s=read('supabase/migrations_v45_production_hardening.sql');
  assert.match(s,/apply_voucher_to_pending_order/);
  assert.match(s,/update public\.orders set voucher_id/);
  assert.match(s,/total_amount=o\.total_amount-d/);
  assert.match(read('src/app/api/checkout/qris/route.ts'),/apply_voucher_to_pending_order/);
  assert.match(read('src/app/api/checkout/gateway/route.ts'),/apply_voucher_to_pending_order/);
});

test('v45 wallet checkout applies voucher atomically before wallet debit',()=>{
  const s=read('supabase/migrations_v45_production_hardening.sql');
  assert.match(s,/create or replace function public\.checkout_with_voucher/);
  assert.match(s,/v_wallet\.balance<v_total/);
  assert.match(s,/balance=balance-v_total/);
  assert.match(read('src/app/api/checkout/route.ts'),/checkout_with_voucher/);
});

test('v45 migration is required by preflight and production audit exists',()=>{
  assert.match(read('scripts/migration-preflight.mjs'),/43,44,45/);
  assert.ok(fs.existsSync(path.join(root,'scripts/final-production-audit-v45.mjs')));
});
