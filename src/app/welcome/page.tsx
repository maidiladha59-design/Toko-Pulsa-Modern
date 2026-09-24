"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Welcome() {
  const [banners, setBanners] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    createClient()
      .from("home_banners")
      .select("id,title,description,file_url,file_type,href,sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        setBanners(data || []);
        setLoading(false);
      });
  }, []);

  function markSeen() {
    document.cookie = `aidil_onboarding_seen=1; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }

  function goNext() {
    markSeen();
  }

  function next() {
    if (!banners.length) return;
    setIndex((v) => (v + 1) % banners.length);
  }

  function prev() {
    if (!banners.length) return;
    setIndex((v) => (v - 1 + banners.length) % banners.length);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 45) return;
    if (delta < 0) next(); else prev();
  }

  const banner = banners[index];

  return (
    <main className="mx-auto max-w-5xl py-4">
      <div
        className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative min-h-[560px]">
          {banner?.file_url ? (
            banner.file_type === "pdf" ? (
              <iframe title={banner.title} src={banner.file_url} className="absolute inset-0 h-full w-full opacity-35" />
            ) : (
              <img src={banner.file_url} alt={banner.title} className="absolute inset-0 h-full w-full object-cover opacity-55" />
            )
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-gold-700 via-zinc-900 to-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-transparent" />

          <div className="relative z-10 flex min-h-[560px] flex-col justify-end p-7 sm:p-12">
            <img src="/aidil-logo.png" alt="AIDIL STORE" className="h-14 w-14 rounded-2xl bg-white p-1 shadow-xl" />
            <p className="mt-6 text-xs font-black uppercase tracking-[.25em] text-amber-300">SELAMAT DATANG DI AIDIL STORE</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-black sm:text-5xl">
              Semua kebutuhan digital dalam satu tempat.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
              Nikmati layanan PPOB, produk digital, Top Up saldo otomatis, pembayaran, transaksi, dan berbagai fitur lainnya dalam satu akun AIDIL STORE.
            </p>

            {banner && (
              <div className="mt-5 max-w-2xl rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <p className="font-black text-amber-300">{banner.title}</p>
                {banner.description && <p className="mt-1 text-sm leading-6 text-white/75">{banner.description}</p>}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <a onClick={goNext} href="/register" className="rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950">
                Lanjutkan · Daftar
              </a>
              <a onClick={goNext} href="/login" className="rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950">
                Lanjutkan · Login
              </a>
              <a onClick={goNext} href="/login" className="rounded-xl border border-white/25 bg-white/5 px-5 py-3 text-sm font-bold text-white">
                Skip
              </a>
            </div>

            {banners.length > 1 && (
              <div className="mt-6 flex items-center gap-2">
                <button onClick={prev} aria-label="Banner sebelumnya" className="rounded-full bg-white/10 px-3 py-2 text-sm font-black hover:bg-white/20">←</button>
                {banners.map((x, i) => (
                  <button key={x.id} aria-label={`Slide ${i + 1}`} onClick={() => setIndex(i)} className={`h-2 rounded-full transition ${i === index ? "w-9 bg-amber-300" : "w-2 bg-white/35"}`} />
                ))}
                <button onClick={next} aria-label="Banner berikutnya" className="rounded-full bg-white/10 px-3 py-2 text-sm font-black hover:bg-white/20">→</button>
              </div>
            )}
            {loading && <p className="mt-4 text-xs text-white/40">Memuat promosi...</p>}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">Geser banner di HP atau gunakan tombol panah. Konten promosi dapat dikelola admin.</p>
    </main>
  );
}