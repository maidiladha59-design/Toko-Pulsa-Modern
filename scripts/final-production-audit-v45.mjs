#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const errors=[]; const warnings=[]; const pass=[];
const exists=p=>fs.existsSync(path.join(root,p));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const walk=(dir,out=[])=>{if(!exists(dir))return out;for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){if(['node_modules','.next','.git','.vercel'].includes(e.name))continue;const r=path.join(dir,e.name);e.isDirectory()?walk(r,out):out.push(r)}return out};
const ok=(n,d)=>pass.push(`${n}: ${d}`); const warn=(n,d)=>warnings.push(`${n}: ${d}`); const fail=(n,d)=>errors.push(`${n}: ${d}`);
for(const f of ['package.json','next.config.js','vercel.json','.env.example','.gitignore','middleware.ts']) exists(f)?ok(`file:${f}`,'present'):fail(`file:${f}`,'missing');
if(!exists('package-lock.json')) warn('lockfile','package-lock.json is absent; pin dependencies before a production release.'); else ok('lockfile','present');
const envExample=exists('.env.example')?read('.env.example'):'';
for(const k of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SITE_URL','FR3NEWERA_API_KEY','DIGIFLAZZ_USERNAME','DIGIFLAZZ_API_KEY','DIGIFLAZZ_WEBHOOK_SECRET','CRON_SECRET']) envExample.includes(`${k}=`)?ok(`env:${k}`,'documented'):fail(`env:${k}`,'not documented');
const gi=exists('.gitignore')?read('.gitignore'):''; for(const x of ['.env.local','.env','node_modules','.next','.vercel']) gi.split(/\r?\n/).map(x=>x.trim()).includes(x)?ok(`gitignore:${x}`,'excluded'):fail(`gitignore:${x}`,'not explicitly excluded');
const source=walk('src').filter(f=>/\.(ts|tsx|js|mjs)$/.test(f));
for(const f of source){const s=read(f);if(/SUPABASE_SERVICE_ROLE_KEY/.test(s)&&/['"]use client['"]/.test(s))fail('client-secret',f);if(/(?:sk_live_|service_role\s*[:=]\s*['"])/i.test(s))fail('secret-scan',f)}
if(!errors.some(x=>x.startsWith('client-secret')||x.startsWith('secret-scan')))ok('secret-scan','no obvious service-role/live-secret exposure in src');
for(const r of ['src/app/api/ppob/webhook/route.ts','src/app/api/payments/fr3newera/webhook/route.ts','src/app/api/ppob/cron/route.ts','src/app/api/admin/monitoring/route.ts']){if(!exists(r))fail('critical-route',r);else ok(`route:${r}`,'present')}
const webhook=exists('src/app/api/ppob/webhook/route.ts')?read('src/app/api/ppob/webhook/route.ts'):''; if(webhook && !/X-Hub-Signature|hmac|signature/i.test(webhook))fail('webhook-auth','PPOB webhook does not show signature verification');
const pak=exists('src/app/api/payments/fr3newera/webhook/route.ts')?read('src/app/api/payments/fr3newera/webhook/route.ts'):''; if(pak && !/transaction|amount|order_id|status/i.test(pak))warn('pakasir-webhook','static audit could not confirm provider detail fields; verify live integration.');
const cron=exists('src/app/api/ppob/cron/route.ts')?read('src/app/api/ppob/cron/route.ts'):''; if(cron && !/CRON_SECRET/.test(cron))fail('cron-auth','PPOB cron missing CRON_SECRET guard');
const pre=exists('scripts/migration-preflight.mjs')?read('scripts/migration-preflight.mjs'):''; if(!/43,44,45/.test(pre))fail('migration-preflight','v45 is not required by preflight'); else ok('migration-preflight','v45 required');
if(!exists('supabase/migrations_v45_production_hardening.sql'))fail('migration-v45','missing'); else ok('migration-v45','present');
if(!exists('tests/production/production-hardening-v45.test.mjs'))fail('v45-tests','missing'); else ok('v45-tests','present');
try{const v=JSON.parse(read('vercel.json'));const c=(v.crons||[]).map(x=>x.path);if(!c.includes('/api/ppob/cron'))fail('vercel-cron','PPOB cron missing');else ok('vercel-cron','PPOB cron present');if(!c.includes('/api/admin/monitoring'))warn('vercel-monitoring-cron','admin monitoring cron missing');}catch{fail('vercel-json','invalid JSON')}
for(const f of ['scripts/migration-preflight.mjs','scripts/production-env-validator.mjs','scripts/deployment-audit-v31.mjs','scripts/supabase-smoke-test.mjs']) exists(f)?ok(`audit:${path.basename(f)}`,'present'):fail('audit-script',f);
console.log('AIDIL STORE — v45 FINAL PRODUCTION AUDIT');
for(const x of pass)console.log(`PASS ${x}`);for(const x of warnings)console.log(`WARN ${x}`);if(errors.length){console.error(`FAIL ${errors.length} issue(s)`);for(const x of errors)console.error(`- ${x}`);process.exit(1)}console.log(`AUDIT PASSED with ${warnings.length} warning(s).`);
