import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

test('v33 production integration verifier passes static contract', () => {
  const out = execFileSync(process.execPath, ['scripts/production-integration-verifier-v33.mjs'], { encoding: 'utf8' });
  assert.match(out, /PASSED/);
  assert.ok(fs.existsSync('PRODUCTION_INTEGRATION_V33.md'));
});
