'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PushNotificationRegistrar() {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) { setReady(true); setEnabled(Boolean(subscription)); }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function enablePush() {
    if (!ready || !('Notification' in window)) return;
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) { alert('Notifikasi push belum dikonfigurasi admin.'); return; }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return;
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const res = await fetch('/api/push-subscriptions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ subscription }) });
    if (res.ok) setEnabled(true);
  }

  async function disablePush() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) { setEnabled(false); return; }
    await fetch('/api/push-subscriptions', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
    setEnabled(false);
  }

  if (!ready) return null;
  return <div className="rounded-2xl border border-dashed bg-slate-50 p-3">
    <div className="text-sm font-bold">Push di perangkat ini</div>
    <p className="mt-1 text-xs text-slate-500">Izinkan browser/perangkat ini menerima notifikasi push (di luar kategori di bawah, ini kontrol izin per perangkat).</p>
    <button onClick={enabled ? disablePush : enablePush} className="mt-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
      {enabled ? 'Matikan notifikasi push' : 'Aktifkan notifikasi push'}
    </button>
  </div>;
}
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
