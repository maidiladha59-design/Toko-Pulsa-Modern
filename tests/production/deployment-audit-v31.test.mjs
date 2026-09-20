import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test('v31 deployment audit passes', () => {
  const root = path.resolve(process.cwd());
  const output = execFileSync(process.execPath, [path.join(root, 'scripts/deployment-audit-v31.mjs')], { cwd: root, encoding: 'utf8' });
  assert.match(output, /AUDIT PASSED/);
});
