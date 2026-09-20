import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => fs.readFileSync(`${root}/${p}`, 'utf8');

test('v49 migration creates DB-backed rate limits and risk tables', () => {
  const s = read('supabase/migrations_v49_fraud_rate_limit.sql');
  assert.match(s, /security_rate_limits/); assert.match(s, /security_risk_events/); assert.match(s, /security_risk_profiles/);
  assert.match(s, /consume_rate_limit/); assert.match(s, /record_security_risk_event/); assert.match(s, /admin_set_risk_status/); assert.match(s, /flag_failed_ppob_risk/); assert.match(s, /flag_topup_burst_risk/);
});
test('v49 middleware applies endpoint-specific rate limits', () => {
  const s = read('src/lib/supabase/middleware.ts');
  for (const x of ['auth','otp','pin','topup','checkout','inquiry','ppob-pay','refund','webhook']) assert.match(s, new RegExp(`name: "${x}"`));
  assert.match(s, /consume_rate_limit/); assert.match(s, /status: 429/); assert.match(s, /Retry-After/);
});
test('transaction PIN failures feed the risk engine', () => {
  const s = read('src/lib/security/transaction-pin.ts'); assert.match(s, /PIN_FAILED/); assert.match(s, /record_security_risk_event/);
});
test('admin Fraud & Risk center exists', () => {
  assert.match(read('src/app/api/admin/fraud/route.ts'), /admin_set_risk_status/);
  assert.match(read('src/app/admin/fraud/page.tsx'), /Fraud & Risk Center/);
  assert.match(read('src/app/admin/AdminSidebar.tsx'), /Fraud & Risk/);
});
