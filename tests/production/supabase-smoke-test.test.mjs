import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
test('v30 Supabase smoke-test script and core object manifest exist', () => {
  assert.equal(fs.existsSync(path.join(root, 'scripts/supabase-smoke-test.mjs')), true);
  assert.equal(fs.existsSync(path.join(root, 'supabase/schema.sql')), true);
  const script = fs.readFileSync(path.join(root, 'scripts/supabase-smoke-test.mjs'), 'utf8');
  for (const name of ['ppob_services','ppob_transactions','ppob_order_targets','ppob_inquiries','notifications','ppob_webhook_events','ppob_provider_syncs','claim_ppob_transaction']) {
    assert.match(script, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
