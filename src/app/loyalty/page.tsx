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
    <div><p className="section-kicker">AIDIL STORE</p><h1 className="text-2xl font-black">Loyalty</h1><p className="mt-1 text-sm text-slate-500">Kumpulkan poin dari transaksi yang berhasil selesai.</p></div>
    {error && <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {data && <div className="grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs text-slate-500">Poin tersedia</p><p className="mt-2 text-3xl font-black">{data.points.toLocaleString('id-ID')}</p></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs text-slate-500">Level</p><p className="mt-2 text-2xl font-black">{data.level_name}</p></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs text-slate-500">Total poin</p><p className="mt-2 text-3xl font-black">{data.lifetime_points.toLocaleString('id-ID')}</p></div>
    </div>}
    <div className="rounded-2xl border bg-white p-5 text-sm text-slate-600">Poin diberikan otomatis setelah pesanan berstatus <b>COMPLETED</b>. Pembaruan status yang sama tidak menggandakan poin.</div>
  </div>;
}
