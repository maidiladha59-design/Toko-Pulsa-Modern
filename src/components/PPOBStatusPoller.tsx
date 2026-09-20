"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PPOBStatusPoller({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [active, router]);
  return active ? <p className="mt-2 text-xs text-gold-700">Status diperbarui otomatis setiap 15 detik.</p> : null;
}
