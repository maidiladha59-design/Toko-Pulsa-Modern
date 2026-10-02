import Link from 'next/link';

export default function RankingHomeCard() {
  return <Link href="/ranking" className="block rounded-2xl border border-app-border bg-gradient-to-r from-app-accent-soft to-app-surface p-5 transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-surface text-2xl shadow-sm">🏆</div><div><p className="text-xs font-black uppercase tracking-widest text-app-kicker">Peringkat</p><h3 className="mt-1 text-lg font-black text-app-text">Lihat Peringkat Pengguna</h3><p className="mt-1 text-xs text-app-subtle">Transaksi berhasil menentukan posisi. Gagal dan dibatalkan tidak dihitung.</p></div></div>
  </Link>;
}
