#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const warnings = [];
const checks = [];
const pass = (name, detail='') => checks.push({status:'PASS',name,detail});
const fail = (name, detail='') => { checks.push({status:'FAIL',name,detail}); failures.push(`${name}: ${detail}`); };
const warn = (name, detail='') => { checks.push({status:'WARN',name,detail}); warnings.push(`${name}: ${detail}`); };
const exists = p => fs.existsSync(path.join(root,p));
const read = p => fs.readFileSync(path.join(root,p),'utf8');

// 1. Required deployment files
for (const f of ['package.json','.env.example','.gitignore','vercel.json','src/app/auth/callback/route.ts','src/app/api/payments/fr3newera/webhook/route.ts','src/app/api/ppob/webhook/route.ts','src/app/api/ppob/cron/route.ts']) {
  exists(f) ? pass(`file:${f}`) : fail(`file:${f}`,'missing');
}

// 2. Environment contract
const env = read('.env.example');
const required = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','FR3NEWERA_API_KEY','DIGIFLAZZ_USERNAME','DIGIFLAZZ_API_KEY','DIGIFLAZZ_WEBHOOK_SECRET','INTERNAL_CRON_SECRET','CRON_SECRET'];
for (const key of required) env.includes(`${key}=`) ? pass(`env:${key}`) : fail(`env:${key}`,'missing from .env.example');

// 3. Production safety rules
const envLocal = exists('.env.local') ? read('.env.local') : '';
if (envLocal) warn('local-env-present','Do not commit .env.local; values are intentionally not inspected.');

else warn('pakasir-default','No explicit sandbox=true default; verify before live use.');
if (env.includes('DIGIFLAZZ_TESTING=true')) pass('digiflazz-default','Example environment defaults to testing.');
else warn('digiflazz-default','No explicit testing=true default; verify before live use.');

// 4. Route security assertions
const cron = read('src/app/api/ppob/cron/route.ts');
const fulfillment = read('src/app/api/ppob/fulfill/route.ts');
const dfWebhook = read('src/app/api/ppob/webhook/route.ts');
const pakWebhook = read('src/app/api/payments/fr3newera/webhook/route.ts');
cron.includes('CRON_SECRET') ? pass('cron-auth','Cron route references CRON_SECRET.') : fail('cron-auth','CRON_SECRET guard not found.');
fulfillment.includes('INTERNAL_CRON_SECRET') ? pass('fulfillment-auth','Internal fulfillment references INTERNAL_CRON_SECRET.') : fail('fulfillment-auth','Internal fulfillment secret guard not found.');
dfWebhook.includes('verifyWebhookSignature') || dfWebhook.includes('x-hub-signature') || dfWebhook.includes('DIGIFLAZZ_WEBHOOK_SECRET') ? pass('digiflazz-webhook-auth','Digiflazz webhook signature handling present.') : fail('digiflazz-webhook-auth','Webhook signature handling not found.');
pakWebhook.includes('verify') || pakWebhook.includes('FR3 NEWERA') ? pass('pakasir-webhook-handler','FR3 NEWERA webhook handler present.') : warn('pakasir-webhook-handler','Could not statically prove callback verification; perform live sandbox test.');

// 5. OAuth callback error visibility
const callback = read('src/app/auth/callback/route.ts');
if (callback.includes('exchangeCodeForSession')) pass('oauth-exchange','OAuth callback exchanges code for session.'); else fail('oauth-exchange','exchangeCodeForSession not found.');
if (callback.includes('error') && callback.includes('redirect')) pass('oauth-error-path','OAuth callback contains an error/redirect path.'); else warn('oauth-error-path','Could not prove user-visible OAuth error path statically.');

// 6. Vercel cron contract
if (exists('vercel.json')) {
  const v = read('vercel.json');
  v.includes('/api/ppob/cron') ? pass('vercel-cron-route','vercel.json references PPOB cron.') : fail('vercel-cron-route','PPOB cron route not found in vercel.json.');
  v.includes('schedule') ? pass('vercel-cron-schedule','Cron schedule declaration present.') : fail('vercel-cron-schedule','No cron schedule declaration.');
}

// 7. Provider endpoints
const df = read('src/lib/ppob/digiflazz.ts');
df.includes("/transaction'") ? pass('digiflazz-transaction-endpoint') : fail('digiflazz-transaction-endpoint','Transaction endpoint missing.');
df.includes("/price-list'") ? pass('digiflazz-pricelist-endpoint') : fail('digiflazz-pricelist-endpoint','Pricelist endpoint missing.');
const pak = read('src/lib/fr3newera.ts');
pak.includes('pakasir.com') ? pass('pakasir-client','FR3 NEWERA integration module present.') : warn('pakasir-client','FR3 NEWERA hostname not found statically.');

// 8. Live verification only when explicitly enabled with production env.
const live = process.argv.includes('--live');
if (live) {
  const liveKeys = required.filter(k => !process.env[k]);
  if (liveKeys.length) fail('live-env','Missing environment variables: '+liveKeys.join(', '));
  else {
    if (process.env.NEXT_PUBLIC_SITE_URL?.startsWith('https://')) pass('live-site-url','HTTPS site URL detected.');
    else fail('live-site-url','NEXT_PUBLIC_SITE_URL must use HTTPS for production.');
    
    if (process.env.DIGIFLAZZ_TESTING === 'false') pass('digiflazz-live-mode','Digiflazz testing disabled.'); else warn('digiflazz-live-mode','Digiflazz is still in testing mode.');
    try {
      const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
      u.protocol === 'https:' ? pass('supabase-url','Supabase URL uses HTTPS.') : fail('supabase-url','Supabase URL is not HTTPS.');
    } catch { fail('supabase-url','Invalid NEXT_PUBLIC_SUPABASE_URL.'); }
  }
} else {
  warn('live-verification','Not run: use npm run verify:integration:live only inside the production environment with real credentials.');
}

// 9. Test suite
try {
  execFileSync(process.execPath,['--test','tests/production/*.test.mjs'],{cwd:root,stdio:'pipe',shell:true});
  pass('production-tests','Production test suite completed successfully.');
} catch (e) {
  fail('production-tests','Production tests failed.');
}

const report = `# AIDIL STORE — v33 Production Integration Verification\n\nGenerated: ${new Date().toISOString()}\n\n## Scope\nStatic verification of the Supabase/Vercel/FR3 NEWERA/Digiflazz/OAuth/cron integration contract. Live external verification is only performed when the --live flag is explicitly used in a real deployment environment.\n\n## Result\n- Checks: ${checks.length}\n- Failures: ${failures.length}\n- Warnings: ${warnings.length}\n\n${failures.length ? '❌ **FAILED**' : '✅ **PASSED**'}\n\n## Checks\n${checks.map(c=>`- ${c.status} — ${c.name}${c.detail?` — ${c.detail}`:''}`).join('\n')}\n\n## Warnings\n${warnings.length ? warnings.map(w=>`- ${w}`).join('\n') : '- None'}\n\n## Production limitation\nA static/local audit cannot prove that remote Supabase migrations, Vercel environment variables, OAuth provider configuration, FR3 NEWERA callbacks, or Digiflazz callbacks are actually active. Those require the target production environment.\n`;
fs.writeFileSync(path.join(root,'PRODUCTION_INTEGRATION_V33.md'),report);
console.log(`V33 integration verification: ${failures.length ? 'FAILED' : 'PASSED'}; ${warnings.length} warning(s); ${checks.length} checks.`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
