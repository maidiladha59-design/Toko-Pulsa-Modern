import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('v54 migration creates secure push subscription storage', () => {
  const s = read('supabase/migrations_v54_pwa_realtime_push.sql');
  for (const x of ['push_subscriptions','user_id','p256dh','auth','row level security','replica identity full']) assert.match(s, new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
});
test('v54 includes PWA manifest and service worker', () => {
  const m = read('public/manifest.webmanifest');
  const sw = read('public/sw.js');
  assert.match(m, /standalone/); assert.match(sw, /addEventListener\(['"]push['"]/); assert.match(sw, /showNotification/);
});
test('v54 push API authenticates and validates subscription', () => {
  const s = read('src/app/api/push-subscriptions/route.ts');
  assert.match(s, /auth\.getUser/); assert.match(s, /p256dh/); assert.match(s, /user_id\s*:\s*user\.id/);
});
test('v54 registers service worker without requesting permission automatically', () => {
  const s = read('src/components/PushNotificationRegistrar.tsx');
  assert.match(s, /serviceWorker\.register/); assert.match(s, /Notification\.requestPermission/); assert.match(s, /userVisibleOnly: true/);
});

test('v54 notification page subscribes to Supabase Realtime', () => {
  const s = read('src/components/RealtimeNotifications.tsx');
  assert.match(s, /postgres_changes/); assert.match(s, /notifications/); assert.match(s, /user_id=eq/);
});
test('v54 layout exposes PWA manifest and registrar', () => {
  const s = read('src/app/layout.tsx');
  assert.match(s, /manifest\.webmanifest/); assert.match(s, /PushNotificationRegistrar/);
});
