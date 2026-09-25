"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

const DEFAULT_TITLE = "AIDIL STORE sedang dalam pemeliharaan";
const DEFAULT_MESSAGE = "Kami sedang melakukan perbaikan dan peningkatan sistem agar layanan AIDIL STORE tetap aman dan nyaman digunakan.";

export default function MaintenancePage() {
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  useEffect(() => {
    createClient()
      .from("maintenance_settings")
      .select("title,message")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.title) setTitle(data.title);
        if (data?.message) setMessage(data.message);
      });
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
        <section className="w-full rounded-[2rem] border border-gold-400/20 bg-white/[.06] p-7 text-center shadow-2xl backdrop-blur sm:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gold-400 text-4xl text-black shadow-lg">🛠️</div>
          <p className="mt-7 text-xs font-black uppercase tracking-[.25em] text-gold-400">AIDIL STORE</p>
          <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{title}</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-white/65">{message}</p>
          <div className="mt-7 rounded-2xl border border-gold-400/20 bg-black/30 p-4 text-left text-sm text-white/75">
            <p className="font-bold text-gold-400">Apa yang perlu dilakukan?</p>
            <p className="mt-2 leading-6">Silakan tunggu beberapa saat, kemudian tekan tombol Coba Lagi. Jika pemeliharaan selesai, kamu akan otomatis dapat menggunakan layanan kembali.</p>
          </div>
          <div className="mt-7 flex justify-center">
            <button onClick={() => window.location.reload()} className="rounded-xl bg-gold-400 px-5 py-3 text-sm font-black text-black hover:bg-gold-300">↻ Coba Lagi</button>
          </div>
          <p className="mt-7 text-xs text-white/35">Transaksi baru sementara dihentikan selama pemeliharaan.</p>
        </section>
      </div>
    </main>
  );
}