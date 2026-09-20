import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('migration preflight passes required checks', () => {
  const out = execFileSync(process.execPath, ['scripts/migration-preflight.mjs'], { encoding: 'utf8' });
  const report = JSON.parse(out);
  assert.equal(report.errors.length, 0);
  assert.deepEqual(report.missing_versions, []);
  assert.ok(report.discovered_versions.includes(25) && report.discovered_versions.includes(34));
});
