#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');

function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

const env = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const live = process.argv.includes('--live');

const tables = [
  'profiles', 'wallets', 'wallet_transactions', 'orders', 'order_items',
  'ppob_services', 'ppob_transactions', 'ppob_order_targets', 'ppob_inquiries',
  'notifications', 'ppob_webhook_events', 'ppob_provider_syncs'
];

const rpcNames = [
  'claim_ppob_transaction', 'claim_ppob_worker_batch', 'finalize_ppob_order',
  'create_ppob_transactions', 'create_ppob_prepaid_wallet_order',
  'create_ppob_postpaid_wallet_order', 'create_ppob_postpaid_gateway_order'
];

const report = { generated_at: new Date().toISOString(), mode: live ? 'live' : 'configuration-only', checks: [], errors: [], warnings: [] };

function add(name, status, detail) { report.checks.push({ name, status, detail }); }

if (!supabaseUrl) { if (live) report.errors.push('NEXT_PUBLIC_SUPABASE_URL is missing'); else report.warnings.push('NEXT_PUBLIC_SUPABASE_URL is not set; configuration-only mode does not require live credentials'); }
else {
  try {
    const u = new URL(supabaseUrl);
    if (u.protocol !== 'https:') report.errors.push('NEXT_PUBLIC_SUPABASE_URL must use HTTPS');
    add('Supabase URL', 'PASS', u.origin);
  } catch { report.errors.push('NEXT_PUBLIC_SUPABASE_URL is invalid'); }
}
if (!anonKey) { if (live) report.errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing'); else report.warnings.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set; configuration-only mode does not require live credentials'); }
else add('Anon key present', 'PASS', 'key present; value omitted');
if (!serviceKey) report.warnings.push('SUPABASE_SERVICE_ROLE_KEY is not available; live table checks use anon key and may be blocked by RLS');
else add('Service role key present', 'PASS', 'key present; value omitted');

async function request(url, headers, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally { clearTimeout(timer); }
}

if (live && report.errors.length === 0) {
  const base = supabaseUrl.replace(/\/$/, '');
  const key = serviceKey || anonKey;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const res = await request(`${base}/auth/v1/settings`, { apikey: anonKey, Authorization: `Bearer ${anonKey}` });
    add('Supabase Auth settings', res.ok ? 'PASS' : 'WARN', `HTTP ${res.status}`);
  } catch (e) { report.errors.push(`Supabase Auth request failed: ${e.message}`); }

  for (const table of tables) {
    try {
      const res = await request(`${base}/rest/v1/${table}?select=*&limit=1`, { ...headers, Accept: 'application/json' });
      if (res.ok) add(`table:${table}`, 'PASS', `HTTP ${res.status}`);
      else {
        const body = await res.text();
        const detail = body.replace(/\s+/g, ' ').slice(0, 180);
        report.errors.push(`table:${table} returned HTTP ${res.status}: ${detail}`);
      }
    } catch (e) { report.errors.push(`table:${table} request failed: ${e.message}`); }
  }

  for (const rpc of rpcNames) {
    try {
      const res = await request(`${base}/rest/v1/rpc/${rpc}`, { ...headers, Accept: 'application/json' }, { method: 'OPTIONS' });
      if (res.ok || res.status === 204) add(`rpc:${rpc}`, 'PASS', `OPTIONS HTTP ${res.status}`);
      else add(`rpc:${rpc}`, 'WARN', `OPTIONS HTTP ${res.status}; RPC existence cannot be proven without invoking it`);
    } catch (e) { report.warnings.push(`rpc:${rpc} OPTIONS failed: ${e.message}`); }
  }
} else if (!live) {
  report.warnings.push('Live Supabase checks were not run. Use: npm run smoke:supabase:live');
}

console.log('AIDIL STORE — Supabase Production Smoke Test');
console.log(JSON.stringify(report, null, 2));
if (report.errors.length) process.exit(1);
