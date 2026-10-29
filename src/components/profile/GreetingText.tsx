"use client";

import { useEffect, useState } from "react";
import { GREETING, greetingForHour } from "@/lib/labels";

// Jam WIB, bukan jam perangkat: pengguna yang bepergian tetap melihat sapaan
// sesuai waktu Indonesia. formatToParts dipakai supaya hasilnya angka 0–23.
const JAKARTA_HOUR = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

function jakartaHour(date: Date = new Date()): number {
  const part = JAKARTA_HOUR.formatToParts(date).find((p) => p.type === "hour");
  const hour = Number(part?.value ?? "0");
  return Number.isFinite(hour) ? hour % 24 : 0;
}

export default function GreetingText({
  guest = false,
  className = "",
}: {
  guest?: boolean;
  className?: string;
}) {
  // null = belum dihitung di browser. Server dan render pertama klien sama-sama
  // menampilkan spasi kosong, jadi tidak ada peringatan hidrasi.
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => {
    if (guest) return;
    const tick = () => setGreeting(greetingForHour(jakartaHour()));
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [guest]);

  return <span className={className}>{guest ? GREETING.welcome : greeting ?? "\u00A0"}</span>;
}
