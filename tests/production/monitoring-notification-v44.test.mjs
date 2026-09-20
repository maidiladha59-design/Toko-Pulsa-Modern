import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('v44 migration contains alert dedupe and run ledger',()=>{const s=read('supabase/migrations_v44_monitoring_notification.sql');assert.match(s,/create table if not exists public\.monitoring_alerts/);assert.match(s,/fingerprint text not null unique/);assert.match(s,/monitoring_runs/);assert.match(s,/upsert_monitoring_alert/);});
test('v44 monitoring API checks reconciliation, refunds, webhooks and stale PPOB',()=>{const s=read('src/app/api/admin/monitoring/route.ts');for(const x of ['payment_reconciliation','refunds','ppob_webhook_events','ppob_transactions','ppob_provider_syncs'])assert.match(s,new RegExp(x));assert.match(s,/monitoring\.manage/);});
test('v44 admin UI exists and is linked',()=>{assert.ok(fs.existsSync(path.join(root,'src/app/admin/monitoring/page.tsx')));assert.match(read('src/app/admin/AdminSidebar.tsx'),/Monitoring & Notifikasi/);});
test('v44 resolve endpoint uses server-side RPC',()=>{const s=read('src/app/api/admin/monitoring/[id].route.ts');assert.match(s,/resolve_monitoring_alert/);assert.doesNotMatch(s,/createAdminClient/);});
test('v44 monitoring is scheduled through CRON_SECRET',()=>{const s=read('src/app/api/admin/monitoring/route.ts');assert.match(s,/CRON_SECRET/);assert.match(read('vercel.json'),/\/api\/admin\/monitoring/);});
test('migration preflight requires v44',()=>{assert.match(read('scripts/migration-preflight.mjs'),/43,44/);});
