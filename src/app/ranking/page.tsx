'use client';

import { useEffect, useState } from 'react';
import { formatRupiah, formatBalanceCompact } from '@/lib/utils';

const medal = (rank: number) => rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

export default function RankingPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/rankings', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || 'Gagal memuat peringkat.');
        setData(j);
      })
      .catch((e) => {
        console.error('[ranking] gagal memuat peringkat', e);
        setError('Gagal memuat. Coba lagi.');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="mx-auto max-w-3xl animate-pulse space-y-4 pb-20" aria-busy="true">
      <div className="h-44 rounded-[2rem] bg-app-inset" />
      <div className="h-64 rounded-3xl border border-app-border bg-app-surface" />
    </div>;
  }

  return <div className="mx-auto max-w-3xl space-y-5 pb-20">
    <section className="app-hero rounded-[2rem] p-6 text-white shadow-xl">
      <h1 className="text-3xl font-black">
        {/* Emoji ikut satu baris dengan judul, tidak pernah jatuh sendiri. */}
        <span className="inline-flex items-center gap-2 whitespace-nowrap">Peringkat Pengguna<span aria-hidden>🏆</span></span>
      </h1>
      <p className="mt-2 text-sm text-white/70">Peringkat dihitung dari jumlah transaksi berhasil. Transaksi gagal, dibatalkan, dan refund tidak dihitung.</p>
      {data?.me ? <div className="mt-5 rounded-2xl bg-white/10 p-4"><p className="text-xs text-white/60">Peringkat Anda</p><p className="mt-1 text-3xl font-black">#{data.me.rank}</p><p className="mt-1 text-sm text-white/70">{data.me.successful_transactions} transaksi berhasil · <span title={formatRupiah(data.me.successful_amount)}>{formatBalanceCompact(data.me.successful_amount)}</span></p></div> : <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm text-white/70">Anda belum punya transaksi berhasil, jadi belum masuk peringkat.</div>}
    </section>

    {error && <div role="alert" className="rounded-2xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm font-bold text-danger-600 dark:text-danger-400">{error}</div>}

    <section className="rounded-3xl border border-app-border bg-app-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-black text-app-text">Pengguna Teratas</h2><span className="text-xs text-app-subtle">Transaksi berhasil</span></div>
      <div className="space-y-2">
        {(data?.top || []).map((row: any) => <div key={row.user_id} className={`flex items-center gap-3 rounded-2xl p-3 ${row.rank <= 3 ? 'bg-app-accent-soft' : 'bg-app-inset'}`}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-app-surface text-xl font-black text-app-text shadow-sm">{medal(row.rank)}</div>
          <div className="min-w-0 flex-1"><p className="truncate font-black text-app-text">{row.profile?.full_name || row.profile?.email?.split('@')[0] || 'Pengguna'}</p><p className="text-xs text-app-muted">{row.successful_transactions} transaksi berhasil</p></div>
          <div className="shrink-0 text-right"><p className="font-black text-app-text">#{row.rank}</p><p className="max-w-[8rem] truncate text-[10px] text-app-subtle" title={formatRupiah(row.successful_amount)}>{formatBalanceCompact(row.successful_amount)}</p></div>
        </div>)}
        {!data?.top?.length && <p className="py-8 text-center text-sm text-app-subtle">Belum ada transaksi berhasil.</p>}
      </div>
    </section>
  </div>;
}
