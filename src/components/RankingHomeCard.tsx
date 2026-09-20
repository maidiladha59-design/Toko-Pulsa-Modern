import Link from 'next/link';

export default function RankingHomeCard() {
  return <Link href="/ranking" className="block rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">🏆</div><div><p className="text-xs font-black uppercase tracking-widest text-amber-700">Peringkat</p><h3 className="mt-1 text-lg font-black text-slate-900">Lihat Peringkat Pengguna</h3><p className="mt-1 text-xs text-slate-500">Transaksi berhasil menentukan posisi. Gagal dan dibatalkan tidak dihitung.</p></div></div>
  </Link>;
}
