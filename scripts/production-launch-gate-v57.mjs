import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'V57_PRODUCTION_LAUNCH_PACK.md',
  'vercel.json',
  'scripts/migration-preflight.mjs',
  'scripts/final-production-audit-v56.mjs',
  'supabase/migrations_v55_monitoring_provider_alerts.sql',
];
const forbidden = [
  '.env.local',
  '.env.production',
];

// Only flag credentials when an actual assignment embeds a non-placeholder value.
// References to service-role grants or environment variable names in source/docs are expected.
const secretAssignmentPatterns = [
  /(?:DIGIFLAZZ_API_KEY|PAKASIR_API_KEY)\s*[:=]\s*['\"]?([^$\s'\"]+)['\"]?/i,
];
let errors = [];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`missing required file: ${file}`);
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const cronPaths = new Set((vercel.crons ?? []).map(x => x.path));
for (const p of ['/api/ppob/cron','/api/admin/monitoring','/api/reconciliation/cron','/api/monitoring/cron']) {
  if (!cronPaths.has(p)) errors.push(`missing cron: ${p}`);
}
function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir, {withFileTypes:true})) {
    if (['node_modules','.next','.git'].includes(name.name)) continue;
    const p = path.join(dir,name.name);
    if (name.isDirectory()) scan(p);
    else {
      const text = fs.readFileSync(p,'utf8');
      if (p.endsWith('.gitignore')) continue;
      for (const re of secretAssignmentPatterns) {
        const match = text.match(re);
        if (match && match[1] && !/^(your|replace|changeme|example|test|dev-\.{3,}|<|\$)/i.test(match[1])) {
          errors.push(`hardcoded provider secret assignment found in ${path.relative(root,p)}`);
        }
      }
    }
  }
}
for (const file of ['.env.local','.env.production']) if (fs.existsSync(path.join(root,file))) errors.push(`forbidden environment file present: ${file}`);
for (const dir of ['src','scripts','supabase']) scan(dir);
const lockExists = fs.existsSync(path.join(root,'package-lock.json'));
console.log(JSON.stringify({ gate:'v57', status: errors.length ? 'FAIL':'PASS', errors, package_lock_present: lockExists }, null, 2));
process.exitCode = errors.length ? 1 : 0;
