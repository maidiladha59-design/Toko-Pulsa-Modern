import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = path.join(root,'supabase','migrations_v51_support_ticketing_operational.sql');

test('v51 migration contains ticket hardening functions and notification trigger',()=>{
  const s=fs.readFileSync(migration,'utf8');
  for (const token of ['create_support_ticket','close_support_ticket','reopen_support_ticket','admin_update_support_ticket','notify_support_ticket_message','TOO_MANY_OPEN_TICKETS']) assert.match(s,new RegExp(token.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')));
});

test('customer support UI exposes close/reopen workflow',()=>{
  const s=fs.readFileSync(path.join(root,'src/app/bantuan/page.tsx'),'utf8');
  assert.match(s,/close_support_ticket/);
  assert.match(s,/reopen_support_ticket/);
  assert.match(s,/Customer Support v51/);
});

test('migration preflight requires v51',()=>{
  const s=fs.readFileSync(path.join(root,'scripts/migration-preflight.mjs'),'utf8');
  assert.match(s,/49,50,51/);
  assert.match(s,/migrations_v51_support_ticketing_operational\.sql/);
});
