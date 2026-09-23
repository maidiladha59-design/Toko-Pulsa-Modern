#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
const examplePath = path.join(root, '.env.example');
const vercelPath = path.join(root, 'vercel.json');

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
  
  'FR3NEWERA_API_KEY',
  'DIGIFLAZZ_USERNAME',
  'DIGIFLAZZ_API_KEY',
  'DIGIFLAZZ_WEBHOOK_SECRET',
  'INTERNAL_CRON_SECRET',
  'CRON_SECRET',
];

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const env = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
const example = fs.existsSync(examplePath) ? parseEnv(fs.readFileSync(examplePath, 'utf8')) : {};
const errors = [];
const warnings = [];

function missing(key) {
  return !env[key] || /^YOUR_|^CHANGE_ME|^REPLACE_|^<.*>$/.test(env[key]);
}

for (const key of required) {
  if (missing(key)) errors.push(`${key} is missing or still a placeholder in .env.local`);
}

if (env.NEXT_PUBLIC_SITE_URL) {
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) errors.push('NEXT_PUBLIC_SITE_URL must use HTTPS outside local development');
    if (url.hostname.endsWith('vercel.app') && url.protocol !== 'https:') errors.push('Vercel production URL must use HTTPS');
  } catch { errors.push('NEXT_PUBLIC_SITE_URL is not a valid URL'); }
}

if (env.DIGIFLAZZ_TESTING === 'true') warnings.push('DIGIFLAZZ_TESTING=true: provider requests are in testing mode');

for (const key of ['SUPABASE_SERVICE_ROLE_KEY','FR3NEWERA_API_KEY','DIGIFLAZZ_API_KEY','DIGIFLAZZ_WEBHOOK_SECRET','INTERNAL_CRON_SECRET','CRON_SECRET']) {
  if (env[key] && env[key].length < 16) errors.push(`${key} is present but looks too short; use the real secret/key`);
}

if (fs.existsSync(vercelPath)) {
  try {
    const v = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
    const cron = (v.crons || []).find(c => c.path === '/api/ppob/cron');
    if (!cron) errors.push('vercel.json is missing the /api/ppob/cron schedule');
    else if (cron.schedule !== '*/2 * * * *') warnings.push(`PPOB cron schedule is ${cron.schedule}, expected */2 * * * * for the documented setup`);
  } catch { errors.push('vercel.json is not valid JSON'); }
} else errors.push('vercel.json is missing');

const migrationsDir = path.join(root, 'supabase');
const requiredMigrations = [
  'migrations_v9_ppob_engine.sql',
  'migrations_v10_ppob_targets.sql',
  'migrations_v13_ppob_postpaid_flow.sql',
  'migrations_v14_ppob_reliability.sql',
  'migrations_v15_ppob_receipts.sql',
  'migrations_v16_notifications_monitoring.sql',
  'migrations_v18_ppob_webhook_hardening.sql',
  'migrations_v19_ppob_wallet_atomic.sql',
  'migrations_v21_provider_health_sync.sql',
  'migrations_v24_production_hardening.sql',
  'migrations_v25_ppob_atomic_claim.sql',
  'migrations_v34_pakasir_wallet_topup.sql',
];
for (const file of requiredMigrations) if (!fs.existsSync(path.join(migrationsDir, file))) errors.push(`Required migration is missing: ${file}`);

console.log('AIDIL STORE — Production Environment Validator');
console.log(`.env.local: ${fs.existsSync(envPath) ? 'FOUND' : 'NOT FOUND'}`);
console.log(`vercel.json: ${fs.existsSync(vercelPath) ? 'FOUND' : 'NOT FOUND'}`);
console.log(`required PPOB migrations: ${requiredMigrations.filter(f => fs.existsSync(path.join(migrationsDir, f))).length}/${requiredMigrations.length}`);
for (const warning of warnings) console.log(`WARN: ${warning}`);
if (errors.length) {
  console.error(`\nVALIDATION FAILED: ${errors.length} issue(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('\nVALIDATION PASSED: production configuration checks are satisfied.');
