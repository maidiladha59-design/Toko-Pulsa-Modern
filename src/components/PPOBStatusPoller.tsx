"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PPOBStatusPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const sync = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    // 30 detik + hanya saat tab terlihat: refresh penuh tiap 15 detik membuat
    // halaman terus me-render ulang di latar belakang.
    const timer = window.setInterval(sync, 30000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, router]);
  return active ? <p className="mt-2 text-xs text-gold-700 dark:text-gold-300">Status diperbarui otomatis setiap 30 detik.</p> : null;
}
