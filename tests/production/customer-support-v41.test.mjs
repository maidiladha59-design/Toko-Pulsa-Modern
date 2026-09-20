import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v41.1 security migration removes broad ticket updates', () => {
  const s = read('supabase/migrations_security_v41_1_customer_support.sql');
  assert.match(s, /revoke update, delete on public\.support_tickets from anon, authenticated/i);
  assert.match(s, /create or replace function public\.create_support_ticket/i);
  assert.match(s, /order_not_found_or_forbidden/i);
});

test('customer ticket creation is atomic through one RPC', () => {
  const s = read('src/app/bantuan/page.tsx');
  assert.match(s, /supabase\.rpc\("create_support_ticket"/);
  assert.doesNotMatch(s, /from\("support_tickets"\)\.insert\(\{user_id:userId/);
});

test('touch_support_ticket validates caller ownership or admin role', () => {
  const s = read('supabase/migrations_security_v41_1_customer_support.sql');
  assert.match(s, /if p_sender_role='ADMIN' then/i);
  assert.match(s, /public\.is_admin\(\)/i);
  assert.match(s, /t\.id=p_ticket_id and t\.user_id=v_user_id/i);
  assert.match(s, /TICKET_NOT_FOUND_OR_FORBIDDEN/i);
});

test('v41 support routes and admin center remain present', () => {
  assert.ok(fs.existsSync(path.join(root, 'src/app/bantuan/page.tsx')));
  assert.ok(fs.existsSync(path.join(root, 'src/app/admin/support/page.tsx')));
  assert.ok(fs.existsSync(path.join(root, 'src/app/admin/AdminSidebar.tsx')));
});
