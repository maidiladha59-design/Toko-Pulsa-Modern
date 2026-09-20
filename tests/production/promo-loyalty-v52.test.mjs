import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = process.cwd();
const migration = fs.readFileSync(`${root}/supabase/migrations_v52_promo_loyalty_operational.sql`, 'utf8');

test('v52 migration exists and contains operational loyalty trigger', () => {
  assert.match(migration, /award_loyalty_points_internal/);
  assert.match(migration, /award_loyalty_for_completed_order/);
  assert.match(migration, /orders_award_loyalty_points/);
  assert.match(migration, /ORDER_COMPLETED/);
});

test('v52 loyalty calculation is server-side and idempotent', () => {
  assert.match(migration, /floor\(coalesce\(new\.total_amount,0\) \/ 1000\)/);
  assert.match(migration, /on conflict\(user_id,reference_type,reference_id\) do nothing/i);
  assert.match(migration, /old\.status = 'COMPLETED'/);
});

test('v52 customer API and page exist', () => {
  assert.ok(fs.existsSync(`${root}/src/app/api/loyalty/route.ts`));
  assert.ok(fs.existsSync(`${root}/src/app/loyalty/page.tsx`));
  assert.match(fs.readFileSync(`${root}/src/app/api/loyalty/route.ts`, 'utf8'), /get_my_loyalty_summary/);
});

test('v52 migration preflight checks v52', () => {
  const s=fs.readFileSync(`${root}/scripts/migration-preflight.mjs`, 'utf8');
  assert.match(s, /52/);
  assert.match(s, /migrations_v52_promo_loyalty_operational\.sql/);
});
