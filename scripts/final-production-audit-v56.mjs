#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const pass=[]; const warnings=[]; const errors=[];
const exists=p=>fs.existsSync(path.join(root,p));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(n,d)=>pass.push(`${n}: ${d}`);
const warn=(n,d)=>warnings.push(`${n}: ${d}`);
const fail=(n,d)=>errors.push(`${n}: ${d}`);

const requiredFiles = [
  'package.json','next.config.js','vercel.json','.env.example','.gitignore','middleware.ts',
  'supabase/migrations_v39_transaction_security.sql','supabase/migrations_v40_reconciliation_refund.sql',
  'supabase/migrations_v49_fraud_rate_limit.sql','supabase/migrations_v50_reconciliation_refund_operational.sql',
  'supabase/migrations_v54_pwa_realtime_push.sql','supabase/migrations_v55_monitoring_provider_alerts.sql',
  'src/app/api/ppob/webhook/route.ts','src/app/api/payments/pakasir/webhook/route.ts',
  'src/app/api/ppob/cron/route.ts','src/app/api/reconciliation/cron/route.ts','src/app/api/monitoring/cron/route.ts',
  'src/lib/security/transaction-pin.ts','public/manifest.webmanifest','public/sw.js'
];
for (const f of requiredFiles) exists(f)?ok(`file:${f}`,'present'):fail(`file:${f}`,'missing');

if (exists('package-lock.json')) ok('lockfile','present'); else warn('lockfile','package-lock.json is absent; generate and commit a lockfile before production deployment.');

const pkg=exists('package.json')?JSON.parse(read('package.json')):{};
if (pkg.version === '1.0.56') ok('version','1.0.56'); else warn('version',`expected 1.0.56, found ${pkg.version||'unknown'}`);

const env=exists('.env.example')?read('.env.example'):'';
for (const k of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SITE_URL','PAKASIR_PROJECT','PAKASIR_API_KEY','DIGIFLAZZ_USERNAME','DIGIFLAZZ_API_KEY','DIGIFLAZZ_WEBHOOK_SECRET','CRON_SECRET'])
  env.includes(`${k}=`)?ok(`env:${k}`,'documented'):fail(`env:${k}`,'not documented');
const gi=exists('.gitignore')?read('.gitignore').split(/\r?\n/).map(x=>x.trim()):[];
for(const x of ['.env.local','.env','node_modules','.next','.vercel']) gi.includes(x)?ok(`gitignore:${x}`,'excluded'):fail(`gitignore:${x}`,'not explicitly excluded');

const walk=(dir,out=[])=>{if(!exists(dir))return out;for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){if(['node_modules','.next','.git','.vercel'].includes(e.name))continue;const r=path.join(dir,e.name);e.isDirectory()?walk(r,out):out.push(r)}return out};
const source=walk('src').filter(f=>/\.(ts|tsx|js|mjs)$/.test(f));
for(const f of source){const s=read(f);if(/SUPABASE_SERVICE_ROLE_KEY/.test(s)&&/['"]use client['"]/.test(s))fail('client-secret',f);if(/(?:sk_live_|service_role\s*[:=]\s*['"])/i.test(s))fail('secret-scan',f);}
if(!errors.some(x=>x.startsWith('client-secret')||x.startsWith('secret-scan')))ok('secret-scan','no obvious service-role/live-secret exposure in src');

const routes=[
 ['ppob-webhook','src/app/api/ppob/webhook/route.ts',/X-Hub-Signature|hmac|signature/i],
 ['ppob-cron','src/app/api/ppob/cron/route.ts',/CRON_SECRET/],
 ['reconciliation-cron','src/app/api/reconciliation/cron/route.ts',/CRON_SECRET/],
 ['monitoring-cron','src/app/api/monitoring/cron/route.ts',/CRON_SECRET/]
];
for(const [n,f,re] of routes){if(!exists(f)) continue; const s=read(f); re.test(s)?ok(`guard:${n}`,'guard present'):fail(`guard:${n}`,'expected security guard not found');}

const vercel=exists('vercel.json')?JSON.parse(read('vercel.json')):{};
const crons=(vercel.crons||[]).map(x=>x.path);
for(const p of ['/api/ppob/cron','/api/reconciliation/cron','/api/monitoring/cron']) crons.includes(p)?ok(`cron:${p}`,'scheduled'):fail(`cron:${p}`,'missing from vercel.json');

const pre=exists('scripts/migration-preflight.mjs')?read('scripts/migration-preflight.mjs'):'';
if(/55/.test(pre)&&/migrations_v55_monitoring_provider_alerts\.sql/.test(pre)) ok('migration-preflight','v55 is required and checked'); else fail('migration-preflight','v55 requirement/check missing');

const audit=exists('scripts/final-production-audit-v45.mjs')?read('scripts/final-production-audit-v45.mjs'):'';
if(audit) warn('legacy-audit','v45 audit script remains legacy; use final-production-audit-v56.mjs for the v56 gate.');

const critical=[
 ['transaction-pin','src/app/api/ppob/prepaid/pay/route.ts',/verifyTransactionPin/],
 ['refund-center','src/app/api/refunds/route.ts',/request_customer_refund/],
 ['reconciliation','src/app/api/reconciliation/cron/route.ts',/payment_reconciliation/],
 ['support','src/app/bantuan/page.tsx',/support_tickets|create_support_ticket/i],
 ['loyalty','src/app/api/loyalty/route.ts',/loyalty/i],
 ['pwa-manifest','public/manifest.webmanifest',/start_url/],
 ['push-worker','public/sw.js',/push|notification/i],
 ['provider-health','src/app/api/monitoring/cron/route.ts',/provider_health_checks|health/i]
];
for(const [n,f,re] of critical){if(!exists(f)){warn(`feature:${n}`,`expected file not found: ${f}`);continue;}re.test(read(f))?ok(`feature:${n}`,'static check passed'):warn(`feature:${n}`,'file exists but expected marker was not found');}

// Run migration preflight as part of the gate when possible.
if (exists('scripts/migration-preflight.mjs')) {
 const r=spawnSync(process.execPath,['scripts/migration-preflight.mjs'],{cwd:root,encoding:'utf8'});
 if(r.status===0) ok('migration-preflight-run','completed with exit code 0'); else fail('migration-preflight-run',`exit code ${r.status}`);
}

console.log('AIDIL STORE — v56 FINAL PRODUCTION AUDIT');
for(const x of pass) console.log(`PASS ${x}`);
for(const x of warnings) console.log(`WARN ${x}`);
if(errors.length){console.error(`FAIL ${errors.length} issue(s)`);for(const x of errors) console.error(`- ${x}`);process.exit(1);}
console.log(`AUDIT PASSED with ${warnings.length} warning(s).`);
