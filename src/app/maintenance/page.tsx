"use client";

export const dynamic = "force-dynamic";

export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
        <section className="w-full rounded-[2rem] border border-white/10 bg-white/[.06] p-7 text-center shadow-2xl backdrop-blur sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-300 text-4xl shadow-lg">🛠️</div>
          <p className="mt-7 text-xs font-black uppercase tracking-[.25em] text-amber-300">AIDIL STORE</p>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Sedang dalam pemeliharaan</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-white/65">
            Kami sedang melakukan perbaikan dan peningkatan sistem agar layanan AIDIL STORE tetap aman dan nyaman digunakan.
          </p>
          <div className="mt-7 rounded-2xl border border-white/10 bg-black/20 p-4 text-left text-sm text-white/75">
            <p className="font-bold text-white">Apa yang perlu dilakukan?</p>
            <p className="mt-2 leading-6">Silakan tunggu beberapa saat, kemudian tekan tombol Coba Lagi. Jika pemeliharaan selesai, kamu akan otomatis dapat menggunakan layanan kembali.</p>
          </div>
          <div className="mt-7 flex justify-center">
            <button onClick={() => window.location.reload()} className="rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950">↻ Coba Lagi</button>
          </div>
          <p className="mt-7 text-xs text-white/35">Transaksi baru sementara dihentikan selama pemeliharaan.</p>
        </section>
      </div>
    </main>
  );
}
