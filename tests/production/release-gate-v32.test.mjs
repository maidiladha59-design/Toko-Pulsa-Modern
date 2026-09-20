import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

test('v32 final release gate passes', () => {
  const root = path.resolve(process.cwd());
  const output = execFileSync(process.execPath, [path.join(root,'scripts/release-gate-v32.mjs')], {cwd:root,encoding:'utf8'});
  assert.match(output,/RELEASE GATE PASSED/);
});
