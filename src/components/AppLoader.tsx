"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SESSION_KEY = "aidilstore_app_loader_v1";
const HOLD_MS = 1200;
const FADE_MS = 300;
const REDUCED_HOLD_MS = 250;

// Disimpan di module scope agar remount kedua (React StrictMode di dev) tidak
// menganggap splash "sudah pernah tampil" lalu menghilang sebelum sempat terlihat.
let claimedInThisDocument = false;

export default function AppLoader() {
  const [phase, setPhase] = useState<"idle" | "active" | "leaving" | "done">("idle");

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* sessionStorage tidak tersedia (private mode) — boleh tampil lagi */
    }
    if (seen && !claimedInThisDocument) {
      setPhase("done");
      return;
    }
    claimedInThisDocument = true;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* abaikan */
    }

    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? REDUCED_HOLD_MS : HOLD_MS;
    const fade = reduced ? 0 : FADE_MS;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setPhase("active");
    const t1 = window.setTimeout(() => setPhase("leaving"), hold);
    const t2 = window.setTimeout(() => {
      document.body.style.overflow = prevOverflow;
      setPhase("done");
    }, hold + fade);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (phase === "idle" || phase === "done") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950 transition-opacity duration-300 ease-out ${
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="app-loader-aura" aria-hidden="true" />
      <div className="relative flex flex-col items-center gap-5 px-6 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="app-loader-halo absolute inset-0 rounded-full" aria-hidden="true" />
          <span className="absolute inset-0 rounded-full border border-gold-400/25" aria-hidden="true" />
          <Image
            src="/aidil-logo.png"
            alt=""
            width={72}
            height={72}
            priority
            className="app-loader-logo relative h-16 w-16 rounded-2xl object-cover shadow-[0_0_34px_rgba(245,197,66,0.35)]"
          />
        </div>
        <p className="app-loader-word text-xs font-black uppercase tracking-[0.24em] text-gold-400">AIDIL STORE</p>
        <div className="h-[2px] w-40 overflow-hidden rounded-full bg-white/10">
          <div className="app-loader-bar h-full w-full origin-left rounded-full bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500" />
        </div>
        <p className="sr-only">Memuat AIDIL STORE</p>
      </div>
    </div>
  );
}
