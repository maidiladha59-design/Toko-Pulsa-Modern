"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "aidilstore_welcome_seen_v1";

const FEATURES = [
  {
    icon: "🛍️",
    title: "Belanja Produk Digital",
    desc: "Voucher, akun premium, dan produk digital lain — langsung dikirim otomatis.",
    tint: "bg-gold-400/15 text-gold-300",
  },
  {
    icon: "⚡",
    title: "QRIS Otomatis",
    desc: "Bayar pakai QRIS lewat FR3 NEWERA — status terverifikasi real-time.",
    tint: "bg-emerald-400/15 text-emerald-300",
  },
  {
    icon: "🔍",
    title: "Cek Status Transaksi",
    desc: "Pantau setiap pesanan dari pending sampai selesai, lengkap dengan riwayatnya.",
    tint: "bg-sky-400/15 text-sky-300",
  },
  {
    icon: "💰",
    title: "Saldo Real-time",
    desc: "Top up saldo kapan saja dan pantau mutasi wallet-mu secara langsung.",
    tint: "bg-violet-400/15 text-violet-300",
  },
] as const;

type Step = "checking" | "loading" | "welcome" | "done";

export default function WelcomeExperience() {
  const [step, setStep] = useState<Step>("checking");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // localStorage tidak tersedia (mis. private mode) — anggap saja sudah pernah lihat.
    }
    if (seen) {
      setStep("done");
      return;
    }
    setStep("loading");
  }, []);

  useEffect(() => {
    if (step !== "loading") return;
    const start = Date.now();
    const duration = 1400;
    const raf = () => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / duration) * 100));
      setProgress(pct);
      if (pct < 100) requestAnimationFrame(raf);
      else setTimeout(() => setStep("welcome"), 150);
    };
    const id = requestAnimationFrame(raf);
    return () => cancelAnimationFrame(id);
  }, [step]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* abaikan */
    }
    setStep("done");
  }

  if (step === "checking" || step === "done") return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-navy px-4 py-8">
      {/* Background glow ala fr3newera.com */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(circle at 20% 15%, rgba(245,197,66,0.16), transparent 45%), radial-gradient(circle at 85% 80%, rgba(245,197,66,0.10), transparent 50%), linear-gradient(180deg, #0b0b10 0%, #111119 55%, #09090b 100%)",
        }}
      />

      {step === "loading" && (
        <div className="relative flex flex-col items-center gap-6 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            <span className="absolute h-full w-full animate-ping rounded-full bg-gold-400/20" />
            <span className="absolute h-full w-full rounded-full border-2 border-gold-400/30" />
            <img
              src="/aidil-logo.png"
              alt="AIDIL STORE"
              className="h-16 w-16 rounded-2xl object-cover shadow-[0_0_30px_rgba(245,197,66,0.35)]"
            />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-[.3em] text-gold-400">AIDIL STORE</p>
            <p className="mt-1 text-xs text-slate-400">Menyiapkan pengalaman belanjamu...</p>
          </div>
          <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-[width] duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {step === "welcome" && (
        <div className="relative w-full max-w-lg animate-page-in rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
          <div className="flex items-center gap-3">
            <img src="/aidil-logo.png" alt="AIDIL STORE" className="h-11 w-11 rounded-xl object-cover" />
            <p className="text-lg font-black tracking-tight text-white">AIDIL STORE</p>
          </div>

          <h1 className="mt-6 text-2xl font-black leading-tight text-white sm:text-3xl">
            Selamat datang di <span className="text-gold-400">AIDIL STORE</span> 👋
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Marketplace digital dengan pembayaran QRIS otomatis via FR3 NEWERA, status transaksi real-time,
            dan saldo wallet yang bisa kamu pantau kapan saja.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${f.tint}`}>{f.icon}</div>
                <p className="mt-3 text-sm font-black text-white">{f.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
            <button
              onClick={dismiss}
              className="flex-1 rounded-2xl bg-gradient-to-r from-gold-500 to-gold-400 px-5 py-3 text-sm font-black text-navy shadow-lg shadow-gold-500/20 transition active:scale-[0.98]"
            >
              Mulai Belanja
            </button>
            <a
              href="/bantuan"
              onClick={dismiss}
              className="flex-1 rounded-2xl border border-white/15 bg-white/[0.03] px-5 py-3 text-center text-sm font-black text-white transition active:scale-[0.98]"
            >
              📖 Pusat Bantuan
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
