#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const checks = [];
const add = (name, status, detail) => checks.push({ name, status, detail });
const exists = (p) => fs.existsSync(path.join(root, p));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|json|sql)$/.test(ent.name)) out.push(full);
  }
  return out;
}
function text(file) { return fs.readFileSync(file, 'utf8'); }

// Required deployment files.
for (const file of ['package.json', 'next.config.js', 'vercel.json', '.env.example', 'middleware.ts']) {
  if (!exists(file)) errors.push(`Missing deployment file: ${file}`);
  else add(`file:${file}`, 'PASS', 'present');
}

// Vercel cron configuration.
if (exists('vercel.json')) {
  try {
    const v = JSON.parse(text(path.join(root, 'vercel.json')));
    const cron = (v.crons || []).find(c => c.path === '/api/ppob/cron');
    if (!cron) errors.push('Vercel cron /api/ppob/cron is missing');
    else if (cron.schedule !== '*/2 * * * *') warnings.push(`PPOB cron schedule is ${cron.schedule}; documented production schedule is */2 * * * *`);
    else add('vercel:ppob-cron', 'PASS', '*/2 * * * *');
  } catch { errors.push('vercel.json is invalid JSON'); }
}

// Environment template sanity: production-only secrets must be documented.
const envExample = exists('.env.example') ? text(path.join(root, '.env.example')) : '';
const requiredEnv = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SITE_URL','FR3NEWERA_API_KEY','DIGIFLAZZ_USERNAME','DIGIFLAZZ_API_KEY','DIGIFLAZZ_WEBHOOK_SECRET','INTERNAL_CRON_SECRET','CRON_SECRET'];
for (const key of requiredEnv) {
  if (!new RegExp(`^${key}=`, 'm').test(envExample)) errors.push(`.env.example does not document ${key}`);
}
if (!errors.some(e => e.includes('.env.example does not document'))) add('env:template', 'PASS', `${requiredEnv.length} required variables documented`);

// Security configuration.
if (exists('next.config.js')) {
  const cfg = text(path.join(root, 'next.config.js'));
  for (const header of ['X-Content-Type-Options','Referrer-Policy','X-Frame-Options','Permissions-Policy']) {
    if (!cfg.includes(header)) warnings.push(`Security header ${header} is not configured in next.config.js`);
  }
  if (cfg.includes('X-Content-Type-Options') && cfg.includes('X-Frame-Options')) add('security:headers', 'PASS', 'baseline browser security headers configured');
}

// Critical endpoint protections.
const routeFiles = walk(path.join(root, 'src/app/api'));
const cronRoute = routeFiles.find(f => f.endsWith('/api/ppob/cron/route.ts'));
if (cronRoute) {
  const s = text(cronRoute);
  if (!s.includes('CRON_SECRET') || !s.includes('Bearer')) errors.push('PPOB cron endpoint does not enforce CRON_SECRET bearer authorization');
  else add('api:cron-auth', 'PASS', 'CRON_SECRET bearer check found');
}
const webhook = routeFiles.find(f => f.endsWith('/api/ppob/webhook/route.ts'));
if (webhook) {
  const s = text(webhook);
  if (!s.includes('verifyWebhookSignature')) errors.push('Digiflazz webhook route does not verify provider signature');
  else add('api:digiflazz-webhook-auth', 'PASS', 'signature verification found');
}
const pakasir = routeFiles.find(f => f.endsWith('/api/payments/fr3newera/webhook/route.ts'));
if (pakasir) {
  const s = text(pakasir);
  if (!s.includes('getGatewayTransactionDetail')) errors.push('FR3 NEWERA webhook does not re-verify payment status through transaction detail API');
  else add('api:pakasir-webhook', 'PASS', 'webhook payload is re-verified through FR3 NEWERA transaction detail');
}

// Dangerous production secrets must never be committed as local env files.
if (exists('.env.local')) warnings.push('.env.local exists in the workspace; verify it is never committed. .gitignore should exclude it.');
const gitignore = exists('.gitignore') ? text(path.join(root, '.gitignore')) : '';
if (!gitignore.split(/\r?\n/).some(x => x.trim() === '.env.local')) errors.push('.gitignore does not explicitly exclude .env.local');
else add('git:env-local', 'PASS', '.env.local excluded');

// Production validator and migration audit are part of the release gate.
for (const script of ['scripts/production-env-validator.mjs','scripts/migration-preflight.mjs','scripts/supabase-smoke-test.mjs']) {
  if (!exists(script)) errors.push(`Release gate script missing: ${script}`);
  else add(`gate:${path.basename(script)}`, 'PASS', 'present');
}

// Detect legacy Midtrans references in executable app code; docs/migrations may legitimately mention it.
const sourceFiles = walk(path.join(root, 'src')).filter(f => /\.(ts|tsx|js|mjs)$/.test(f));
const legacyHits = [];
for (const f of sourceFiles) {
  const s = text(f);
  if (/midtrans|create_payment_order/i.test(s)) legacyHits.push(path.relative(root, f));
}
if (legacyHits.length) warnings.push(`Legacy payment references found in source: ${legacyHits.join(', ')}`);
else add('legacy:midtrans', 'PASS', 'no legacy Midtrans references in src');

// Package scripts expected by the release gate.
if (exists('package.json')) {
  const pkg = JSON.parse(text(path.join(root, 'package.json')));
  for (const [name, command] of [['validate:production','scripts/production-env-validator.mjs'],['validate:migrations','scripts/migration-preflight.mjs'],['smoke:supabase','scripts/supabase-smoke-test.mjs']]) {
    if (!pkg.scripts?.[name]?.includes(command)) errors.push(`package.json script ${name} is missing or points elsewhere`);
  }
  add('package:release-gates', 'PASS', 'production, migration and Supabase smoke commands are registered');
}

console.log('AIDIL STORE — v31 Production Deployment Audit');
for (const c of checks) console.log(`${c.status} ${c.name}: ${c.detail}`);
for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length) {
  console.error(`\nAUDIT FAILED: ${errors.length} error(s)`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`\nAUDIT PASSED with ${warnings.length} warning(s).`);
