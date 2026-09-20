#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [], warnings = [], checks = [];
const ok = (n,d) => checks.push(['PASS',n,d]);
const warn = (n,d) => { warnings.push(`${n}: ${d}`); checks.push(['WARN',n,d]); };
const fail = (n,d) => errors.push(`${n}: ${d}`);
const abs = p => path.isAbsolute(p) ? p : path.join(root,p);
const exists = p => fs.existsSync(abs(p));
const read = p => fs.readFileSync(abs(p),'utf8');
function walk(dir,out=[]) {
  if (!exists(path.relative(root,dir))) return out;
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if (['node_modules','.next','.git','.vercel'].includes(e.name)) continue;
    const f=path.join(dir,e.name); e.isDirectory()?walk(f,out):out.push(f);
  } return out;
}

for (const f of ['package.json','next.config.js','vercel.json','.env.example','.gitignore','middleware.ts']) {
  if (!exists(f)) fail('required-file', `missing ${f}`); else ok(`file:${f}`,'present');
}
if (!exists('package-lock.json')) warn('package-lock','package-lock.json is not present; Vercel can install from package.json, but a committed lockfile is recommended for reproducible dependency versions.'); else ok('file:package-lock.json','present');

if (exists('package.json')) {
  const p=JSON.parse(read('package.json'));
  const scripts=p.scripts||{};
  for (const [name,needle] of [
    ['build','next build'],['test','node --test'],['test:production','tests/production'],['test:e2e:sandbox','run-ppob-sandbox'],
    ['validate:production','production-env-validator'],['validate:migrations','migration-preflight'],['audit:schema','schema-consistency-audit'],
    ['smoke:supabase','supabase-smoke-test'],['audit:deployment','deployment-audit-v31']
  ]) if (!scripts[name] || !scripts[name].includes(needle)) fail('package-script', `${name} is missing or unexpected`); else ok(`script:${name}`,'registered');
}

if (exists('vercel.json')) {
  try { const v=JSON.parse(read('vercel.json')); const cron=(v.crons||[]).find(x=>x.path==='/api/ppob/cron');
    if (!cron) fail('vercel-cron','/api/ppob/cron is missing'); else if(cron.schedule!=='*/2 * * * *') warn('vercel-cron',`schedule is ${cron.schedule}`); else ok('vercel-cron','*/2 * * * *');
  } catch { fail('vercel-json','invalid JSON'); }
}

const env=exists('.env.example')?read('.env.example'):'';
for (const k of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SITE_URL','PAKASIR_PROJECT','PAKASIR_API_KEY','DIGIFLAZZ_USERNAME','DIGIFLAZZ_API_KEY','DIGIFLAZZ_WEBHOOK_SECRET','INTERNAL_CRON_SECRET','CRON_SECRET']) {
  if(!new RegExp(`^${k}=`, 'm').test(env)) fail('env-template',`${k} not documented`);
}
if (!errors.some(e=>e.startsWith('env-template'))) ok('env-template','required production variables documented');

const gi=exists('.gitignore')?read('.gitignore').split(/\r?\n/).map(x=>x.trim()):[];
for(const item of ['.env.local','.env','.vercel','node_modules','.next']) if(!gi.includes(item)) fail('gitignore',`${item} is not explicitly excluded`); else ok(`gitignore:${item}`,'excluded');

const source=walk(path.join(root,'src')).filter(f=>/\.(ts|tsx|js|mjs)$/.test(f));
const secretPatterns=[/sk_live_[A-Za-z0-9_-]{12,}/,/service_role\s*[:=]\s*['"][A-Za-z0-9._-]{20,}/i,/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{24,}/i];
for(const f of source){ const s=read(f); for(const r of secretPatterns) if(r.test(s)) fail('secret-scan',path.relative(root,f)); }
if(!errors.some(e=>e.startsWith('secret-scan'))) ok('secret-scan','no obvious hard-coded production secret patterns in src');

const routes=source.filter(f=>f.includes(`${path.sep}src${path.sep}app${path.sep}api${path.sep}`));
for(const required of ['ppob/cron/route.ts','ppob/webhook/route.ts','payments/pakasir/webhook/route.ts','ppob/status/route.ts']) {
  if(!routes.some(f=>f.endsWith(required))) fail('critical-route',`missing ${required}`); else ok(`route:${required}`,'present');
}

const docs=['MIGRATION_PREFLIGHT_V28.md','PRODUCTION_VALIDATOR_V27.md','E2E_SANDBOX_V26.md'];
for(const d of docs) if(!exists(d)) warn('release-doc',`${d} missing from package`); else ok(`doc:${d}`,'present');
for(const s of ['scripts/schema-consistency-audit.mjs','scripts/supabase-smoke-test.mjs','scripts/deployment-audit-v31.mjs','scripts/migration-preflight.mjs','scripts/production-env-validator.mjs']) if(!exists(s)) fail('gate-script',`missing ${s}`); else ok(`gate:${path.basename(s)}`,'present');

// Ensure app code does not accidentally expose service-role env to client components.
for(const f of source.filter(f=>f.endsWith('.tsx'))) { const s=read(f); if(s.includes("SUPABASE_SERVICE_ROLE_KEY") && s.includes("'use client'")) fail('client-secret',path.relative(root,f)); }
if(!errors.some(e=>e.startsWith('client-secret'))) ok('client-secret','service-role key is not referenced from client components');

console.log('AIDIL STORE — v32 Final Build & Release Gate');
for(const [st,n,d] of checks) console.log(`${st} ${n}: ${d}`);
for(const w of warnings) console.log(`WARN: ${w}`);
if(errors.length){ console.error(`\nRELEASE GATE FAILED: ${errors.length} error(s)`); errors.forEach(e=>console.error(`- ${e}`)); process.exit(1); }
console.log(`\nRELEASE GATE PASSED with ${warnings.length} warning(s).`);
