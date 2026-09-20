import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');

test('v53 migration fixes enum/text permission comparison and locks SUPER_ADMIN permissions', () => {
  const s = read('supabase/migrations_v53_admin_permission_audit_operational.sql');
  assert.match(s, /rp\.role=pr\.role::text/);
  assert.match(s, /SUPER_ADMIN_PERMISSIONS_LOCKED/);
  assert.match(s, /audit_logs_target_type_idx/);
});

test('v53 audit API enforces audit.view and supports filters/pagination', () => {
  const s = read('src/app/api/admin/audit/route.ts');
  assert.match(s, /audit\.view/);
  assert.match(s, /target_type/);
  assert.match(s, /actor_id/);
  assert.match(s, /offset/);
});

test('v53 permission API only changes ADMIN permissions', () => {
  const s = read('src/app/api/admin/permissions/route.ts');
  assert.match(s, /b\?\.role !== 'ADMIN'/);
  assert.match(s, /SUPER_ADMIN diperlukan/);
});

test('v53 migration preflight includes version 53', () => {
  const s = read('scripts/migration-preflight.mjs');
  assert.match(s, /52,53/);
  assert.match(s, /migrations_v53_admin_permission_audit_operational\.sql/);
});
