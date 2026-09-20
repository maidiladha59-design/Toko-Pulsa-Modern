import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('v43 migration defines granular permissions and protected updater',()=>{const s=read('supabase/migrations_v43_admin_permission_audit.sql');assert.match(s,/admin_role_permissions/);assert.match(s,/SUPER_ADMIN_ONLY/);assert.match(s,/has_admin_permission/);});
test('v43 admin APIs exist',()=>{assert.ok(fs.existsSync(path.join(root,'src/app/api/admin/permissions/route.ts')));assert.ok(fs.existsSync(path.join(root,'src/app/api/admin/audit/route.ts')));});
test('v43 admin pages and sidebar exist',()=>{assert.ok(fs.existsSync(path.join(root,'src/app/admin/permissions/page.tsx')));assert.ok(fs.existsSync(path.join(root,'src/app/admin/audit/page.tsx')));assert.match(read('src/app/admin/AdminSidebar.tsx'),/Permission Admin/);assert.match(read('src/app/admin/AdminSidebar.tsx'),/Audit Log/);});
test('v43 updater is super-admin protected',()=>assert.match(read('src/app/api/admin/permissions/route.ts'),/role==='SUPER_ADMIN'/));
