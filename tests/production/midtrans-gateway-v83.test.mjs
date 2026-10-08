import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v83 migration accepts midtrans topups, bca_va orders and disables non-Midtrans VA rows', () => {
  const sql = read('supabase/migrations_v83_midtrans_gateway.sql');
  assert.match(sql, /create or replace function public\.confirm_gateway_topup/i);
  assert.match(sql, /not in \('midtrans', 'fr3newera', 'pakasir'\)/i);
  assert.match(sql, /'qris','bca_va','bri_va','bni_va'/i);
  assert.match(sql, /\('bca_va','BCA Virtual Account'/i);
  assert.match(
    sql,
    /provider_method in \('cimb_niaga_va','maybank_va','bnc_va','sampoerna_va','atm_bersama_va','artha_graha_va'\)/i
  );
});

test('midtrans client reads credentials from env, never hardcodes keys, picks base URL by env flag', () => {
  const lib = read('src/lib/midtrans.ts');
  assert.match(lib, /process\.env\.MIDTRANS_SERVER_KEY/);
  assert.match(lib, /process\.env\.MIDTRANS_CLIENT_KEY/);
  assert.match(lib, /process\.env\.MIDTRANS_IS_PRODUCTION/);
  assert.match(lib, /https:\/\/api\.midtrans\.com/);
  assert.match(lib, /https:\/\/api\.sandbox\.midtrans\.com/);
  assert.doesNotMatch(lib, /SB-Mid-server|Mid-server-/);
});

test('every gateway route uses the midtrans lib, none imports fr3newera anymore', () => {
  for (const f of [
    'src/app/api/checkout/gateway/route.ts',
    'src/app/api/checkout/qris/route.ts',
    'src/app/api/topup/route.ts',
    'src/app/api/topup/history/route.ts',
    'src/app/api/ppob/postpaid/pay/route.ts',
    'src/app/api/orders/[id]/status/route.ts',
    'src/app/api/reconciliation/cron/route.ts',
    'src/app/api/admin/reconciliation/run/route.ts',
  ]) {
    const s = read(f);
    assert.match(s, /@\/lib\/midtrans/, `${f} must import the midtrans lib`);
    assert.doesNotMatch(s, /@\/lib\/fr3newera/, `${f} must not import fr3newera anymore`);
  }
});

test('midtrans webhook verifies signature_key and rejects invalid signatures with 401', () => {
  const webhook = read('src/app/api/payments/midtrans/webhook/route.ts');
  assert.match(webhook, /verifyGatewayWebhookSignature/);
  assert.match(webhook, /status: 401/);
  assert.match(webhook, /confirm_gateway_topup/);
  assert.match(webhook, /confirm_gateway_payment/);
});

test('customer and admin pages no longer mention FR3 NEWERA', () => {
  for (const f of [
    'src/app/orders/[id]/page.tsx',
    'src/app/orders/[id]/receipt/page.tsx',
    'src/components/WelcomeExperience.tsx',
    'src/app/admin/payment-settings/page.tsx',
    'src/app/admin/reconciliation/page.tsx',
  ]) {
    assert.doesNotMatch(read(f), /FR3/i, `${f} still mentions FR3`);
  }
});

test('admin payment settings offers Midtrans-supported gateway methods', () => {
  const page = read('src/app/admin/payment-settings/page.tsx');
  for (const m of ['qris', 'bca_va', 'bni_va', 'bri_va', 'permata_va']) {
    assert.match(page, new RegExp(`'${m}'`), `payment settings must offer ${m}`);
  }
  assert.doesNotMatch(page, /FR3/i);
});
