import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const migration=fs.readFileSync(path.join(root,'supabase','migrations_v38_financial_dashboard.sql'),'utf8');
const page=fs.readFileSync(path.join(root,'src','app','admin','finance','page.tsx'),'utf8');
const api=fs.readFileSync(path.join(root,'src','app','api','admin','finance','route.ts'),'utf8');
const csv=fs.readFileSync(path.join(root,'src','app','api','admin','finance','export','route.ts'),'utf8');
const sidebar=fs.readFileSync(path.join(root,'src','app','admin','AdminSidebar.tsx'),'utf8');

test('v38 financial schema and idempotent triggers exist',()=>{
 assert.match(migration,/create table if not exists public\.financial_ledger/);
 assert.match(migration,/unique\(event_type, source_type, source_id\)/);
 assert.match(migration,/record_financial_order/);
 assert.match(migration,/record_financial_topup/);
 assert.match(migration,/trg_financial_orders/);
 assert.match(migration,/trg_financial_topups/);
 assert.match(migration,/on conflict \(event_type,source_type,source_id\) do nothing/i);
});

test('v38 dashboard supports daily weekly monthly and csv',()=>{
 assert.match(api,/period === "week"/);
 assert.match(api,/period === "month"/);
 assert.match(page,/Hari ini/);
 assert.match(page,/7 hari/);
 assert.match(page,/30 hari/);
 assert.match(page,/Export CSV/);
 assert.match(csv,/Content-Type.*text\/csv/);
});

test('v38 dashboard is linked in admin navigation',()=>assert.match(sidebar,/\/admin\/finance.*Keuangan/));
