import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
test('v55 migration defines provider health telemetry',()=>{const s=fs.readFileSync(path.join(root,'supabase/migrations_v55_monitoring_provider_alerts.sql'),'utf8');assert.match(s,/create table if not exists public\.provider_health_checks/i);assert.match(s,/monitoring\.provider\.view/i)});
test('v55 monitoring cron requires CRON_SECRET',()=>{const s=fs.readFileSync(path.join(root,'src/app/api/monitoring/cron/route.ts'),'utf8');assert.match(s,/CRON_SECRET/);assert.match(s,/authorization/);assert.match(s,/getPrepaidPriceList/)});
test('v55 schedules provider monitoring every five minutes',()=>{const s=fs.readFileSync(path.join(root,'vercel.json'),'utf8');assert.match(s,/\/api\/monitoring\/cron/);assert.match(s,/\*\/5 \* \* \* \*/)});
test('admin monitoring exposes provider health',()=>{const s=fs.readFileSync(path.join(root,'src/app/api/admin/monitoring/route.ts'),'utf8');assert.match(s,/provider_health_checks/);assert.match(s,/providerHealth/)});
