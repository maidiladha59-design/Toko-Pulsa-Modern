// Dependency-free production audit for AIDIL STORE.
// Run: node scripts-production-audit.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'package.json', 'vercel.json', '.env.example',
  'supabase/migrations_v19_ppob_wallet_atomic.sql',
  'supabase/migrations_v24_production_hardening.sql',
  'src/app/api/ppob/webhook/route.ts',
  'src/app/api/ppob/cron/route.ts',
  'src/app/api/ppob/prepaid/pay/route.ts',
  'src/app/api/ppob/postpaid/pay/route.ts',
];
const failures = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) failures.push(`Missing: ${file}`);
const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','FR3NEWERA_PROJECT_UNUSED','FR3NEWERA_API_KEY','DIGIFLAZZ_USERNAME','DIGIFLAZZ_API_KEY','CRON_SECRET','INTERNAL_CRON_SECRET']) {
  if (!env.includes(`${key}=`)) failures.push(`Missing env declaration: ${key}`);
}
const cron = fs.readFileSync(path.join(root, 'src/app/api/ppob/cron/route.ts'), 'utf8');
if (!cron.includes('CRON_SECRET') || !cron.includes('Bearer')) failures.push('Cron route is not protected by CRON_SECRET bearer auth');
const fulfill = fs.readFileSync(path.join(root, 'src/app/api/ppob/fulfill/route.ts'), 'utf8');
if (!fulfill.includes('!secret')) failures.push('Internal fulfill route allows an unset secret');
const webhook = fs.readFileSync(path.join(root, 'src/app/api/ppob/webhook/route.ts'), 'utf8');
if (!webhook.includes('verifyWebhookSignature')) failures.push('Webhook signature verification not found');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations_v24_production_hardening.sql'), 'utf8');
if (!migration.includes('wallet_transactions_order_refund_once_idx')) failures.push('Refund uniqueness guard missing');
if (failures.length) { console.error('AUDIT FAILED'); failures.forEach(x => console.error('- ' + x)); process.exit(1); }
console.log('AUDIT PASSED: required production safeguards are present.');
