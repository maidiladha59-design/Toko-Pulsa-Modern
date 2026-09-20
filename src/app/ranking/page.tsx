'use client';

import { useEffect, useState } from 'react';
import { formatRupiah } from '@/lib/utils';

const medal = (rank: number) => rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

export default function RankingPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/rankings', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || 'Gagal memuat peringkat.');
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  return <div className="mx-auto max-w-3xl space-y-5 pb-20">
    <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-zinc-950 to-gold-700 p-6 text-white shadow-xl">
      <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">AIDIL STORE</p>
      <h1 className="mt-2 text-3xl font-black">Peringkat Pengguna 🏆</h1>
      <p className="mt-2 text-sm text-white/70">Peringkat dihitung dari jumlah transaksi yang berhasil <b>COMPLETED</b>. Gagal, dibatalkan, dan refund tidak dihitung.</p>
      {data?.me ? <div className="mt-5 rounded-2xl bg-white/10 p-4"><p className="text-xs text-white/60">Peringkat kamu</p><p className="mt-1 text-3xl font-black">#{data.me.rank}</p><p className="mt-1 text-sm text-white/70">{data.me.successful_transactions} transaksi berhasil · {formatRupiah(data.me.successful_amount)}</p></div> : <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm text-white/70">Belum memiliki transaksi berhasil, jadi belum masuk peringkat.</div>}
    </section>

    {error && <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

    <section className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-black">Top Pengguna</h2><span className="text-xs text-slate-400">Transaksi berhasil</span></div>
      <div className="space-y-2">
        {(data?.top || []).map((row: any) => <div key={row.user_id} className={`flex items-center gap-3 rounded-2xl p-3 ${row.rank <= 3 ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-black shadow-sm">{medal(row.rank)}</div>
          <div className="min-w-0 flex-1"><p className="truncate font-black">{row.profile?.full_name || row.profile?.email?.split('@')[0] || 'Pengguna'}</p><p className="text-xs text-slate-500">{row.successful_transactions} transaksi berhasil</p></div>
          <div className="text-right"><p className="font-black">#{row.rank}</p><p className="text-[10px] text-slate-400">{formatRupiah(row.successful_amount)}</p></div>
        </div>)}
        {!data?.top?.length && <p className="py-8 text-center text-sm text-slate-400">Belum ada transaksi berhasil.</p>}
      </div>
    </section>
  </div>;
}
