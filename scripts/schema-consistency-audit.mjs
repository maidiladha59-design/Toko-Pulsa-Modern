#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), errors=[], warnings=[];
const files=[];
function walk(dir){if(!fs.existsSync(dir))return; for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.next','.git','.vercel'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(ts|tsx|js|mjs|sql)$/.test(e.name))files.push(f)}}
walk(path.join(root,'src')); walk(path.join(root,'supabase'));
const texts=files.map(f=>[f,fs.readFileSync(f,'utf8')]);
const tables=new Set(), rpcs=new Set(), defs=new Set();
for(const [f,s] of texts){for(const m of s.matchAll(/\.from\(\s*["'`]([^"'`]+)["'`]\s*\)/g))tables.add(m[1]);for(const m of s.matchAll(/\.rpc\(\s*["'`]([^"'`]+)["'`]/g))rpcs.add(m[1]);for(const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)/gi))defs.add(m[1]);}
const sql=texts.filter(([f])=>f.includes(`${path.sep}supabase${path.sep}`)).map(([,s])=>s).join('\n');
const definedTables=new Set([...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi)].map(m=>m[1]));
const definedFns=new Set([...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)].map(m=>m[1]));
const external=['products','product_categories','orders','order_items','customers','profiles','payments','wallets','wallet_ledger','notifications','ppob_services','ppob_transactions','ppob_order_targets','ppob_inquiries','ppob_webhook_events','ppob_provider_syncs','admin_users'];
for(const t of tables) if(!definedTables.has(t)&&!external.includes(t)) warnings.push(`table reference not statically defined: ${t}`);
for(const r of rpcs) if(!definedFns.has(r)&&!external.includes(r)) warnings.push(`RPC reference not statically defined: ${r}`);
const requiredTables=['ppob_services','ppob_transactions','ppob_order_targets','ppob_inquiries','notifications','ppob_webhook_events','ppob_provider_syncs'];
for(const t of requiredTables) if(!definedTables.has(t)) errors.push(`critical table missing from SQL definitions: ${t}`);
if(!definedFns.has('claim_ppob_transaction')) errors.push('critical RPC missing from SQL definitions: claim_ppob_transaction');
console.log('AIDIL STORE — v29 Schema Consistency Audit');
console.log(`Source table refs: ${tables.size}; RPC refs: ${rpcs.size}; SQL tables: ${definedTables.size}; SQL functions: ${definedFns.size}`);
for(const w of warnings)console.log(`WARN: ${w}`);for(const e of errors)console.error(`ERROR: ${e}`);
if(errors.length){console.error(`AUDIT FAILED: ${errors.length} error(s)`);process.exit(1)}
console.log(`AUDIT PASSED with ${warnings.length} warning(s).`);
