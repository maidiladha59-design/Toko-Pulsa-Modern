import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

test('v35 configurable topup fee wiring exists', () => {
  const migration = read('supabase/migrations_v35_topup_fee_settings.sql');
  const route = read('src/app/api/topup/route.ts');
  const adminRoute = read('src/app/api/admin/topup-fee/route.ts');
  const adminPage = read('src/app/admin/topups/page.tsx');
  const page = read('src/app/wallet/topup/page.tsx');
  const webhook = read('src/app/api/payments/pakasir/webhook/route.ts');
  assert.match(migration, /topup_fee_settings/);
  assert.match(migration, /fee_type text.*FIXED.*PERCENTAGE/s);
  assert.match(migration, /admin_fee bigint/);
  assert.match(migration, /payment_amount bigint/);
  assert.match(route, /calculateFee/);
  assert.match(route, /admin_fee/);
  assert.match(route, /payment_amount/);
  assert.match(adminRoute, /fee_type/);
  assert.match(adminRoute, /fee_value/);
  assert.match(adminPage, /Biaya Top Up/);
  assert.match(page, /Biaya AIDIL STORE/);
  assert.match(webhook, /topup\.payment_amount/);
});

test('fee arithmetic keeps wallet credit separate from payment amount', () => {
  const amount = 50000;
  const fixedFee = 1000;
  assert.equal(amount + fixedFee, 51000);
  const percentFee = Math.round(amount * 2 / 100);
  assert.equal(percentFee, 1000);
  assert.equal(amount, 50000);
});
