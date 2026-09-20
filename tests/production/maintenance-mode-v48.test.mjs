import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => fs.readFileSync(`${root}/${p}`, 'utf8');

test('v48 migration creates maintenance settings and RLS policies', () => { const s=read('supabase/migrations_v48_maintenance_mode.sql'); assert.match(s,/create table if not exists public\.maintenance_settings/i); assert.match(s,/allow_admin_bypass/i); assert.match(s,/maintenance_public_read/i); assert.match(s,/maintenance_admin_all/i); });
test('middleware enforces maintenance for pages and customer APIs while preserving operational APIs', () => { const s=read('src/lib/supabase/middleware.ts'); assert.match(s,/maintenance_settings/); assert.match(s,/active/); assert.match(s,/url\.pathname = "\/maintenance"/); assert.match(s,/status: 503/); assert.match(s,/Retry-After/); assert.match(s,/isOperationalApi/); });
test('admin maintenance page exposes on/off and scheduling controls', () => { const s=read('src/app/admin/maintenance/page.tsx'); assert.match(s,/MAINTENANCE ON/); assert.match(s,/Simpan Pengaturan/); assert.match(s,/datetime-local/); assert.match(s,/allow_admin_bypass/); });
test('admin API records maintenance audit actions', () => { const s=read('src/app/api/admin/maintenance/route.ts'); assert.match(s,/maintenance\.enabled/); assert.match(s,/maintenance\.disabled/); assert.match(s,/audit_logs/); });
test('maintenance page has a client-side retry button', () => { const s=read('src/app/maintenance/page.tsx'); assert.match(s,/"use client"/); assert.match(s,/window\.location\.reload/); });
