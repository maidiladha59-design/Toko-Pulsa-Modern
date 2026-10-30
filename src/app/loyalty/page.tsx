'use client';
import { useEffect, useState } from 'react';

export default function LoyaltyPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/loyalty').then(async r => {
      const j = await r.json();
      if (!r.ok) setError(j.message || 'Gagal memuat loyalty.');
      else setData(j);
    }).catch(() => setError('Gagal memuat loyalty.'));
  }, []);

  return <div className="mx-auto max-w-2xl space-y-5 p-5">
    <div><h1 className="text-2xl font-black text-app-text">Loyalty</h1><p className="mt-1 text-sm text-app-muted">Kumpulkan poin dari setiap transaksi yang berhasil.</p></div>
    {error && <div className="rounded-2xl bg-danger-50 p-4 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">{error}</div>}
    {data && <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-app-border bg-app-surface p-5"><p className="text-xs text-app-muted">Poin tersedia</p><p className="mt-2 text-3xl font-black text-app-text">{data.points.toLocaleString('id-ID')}</p></div>
      <div className="rounded-2xl border border-app-border bg-app-surface p-5"><p className="text-xs text-app-muted">Level</p><p className="mt-2 text-2xl font-black text-app-text">{data.level_name}</p></div>
      <div className="rounded-2xl border border-app-border bg-app-surface p-5"><p className="text-xs text-app-muted">Total poin</p><p className="mt-2 text-3xl font-black text-app-text">{data.lifetime_points.toLocaleString('id-ID')}</p></div>
    </div>}
    <div className="rounded-2xl border border-app-border bg-app-surface p-5 text-sm text-app-muted">Poin diberikan otomatis setelah pesanan berhasil. Status yang sama tidak menghitung poin dua kali.</div>
  </div>;
}
