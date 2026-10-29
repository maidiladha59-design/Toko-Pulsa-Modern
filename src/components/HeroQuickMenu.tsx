"use client";

import Link from "next/link";
import NavIcon from "@/components/NavIcon";
import { useEffect, useState } from "react";

// Menu cepat di dalam kartu hero beranda: satu baris, empat kolom sama lebar,
// ikon di atas label. Tidak ada kotak atau tombol berwarna — semua item memakai
// bentuk yang sama supaya tampak rata seperti aplikasi referensi.
const ITEMS = [
  { href: "/profile", label: "Profil", icon: "person" },
  { href: "/transactions", label: "Rekap", icon: "document" },
  { href: "/bantuan", label: "Bantuan", icon: "question" },
  { href: "/notifications", label: "Info", icon: "bell" },
] as const;

export default function HeroQuickMenu({ unread }: { unread: number }) {
  const [count, setCount] = useState(unread);

  useEffect(() => setCount(unread), [unread]);

  // NotificationBell sudah menghitung jumlah belum dibaca; bagikan lewat event
  // supaya badge hero ikut berubah setelah pengguna membaca notifikasi.
  useEffect(() => {
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ unread?: number }>).detail;
      setCount(Math.max(0, Number(detail?.unread ?? 0)));
    };
    window.addEventListener("aidil:notifications-updated", onUpdated);
    return () => window.removeEventListener("aidil:notifications-updated", onUpdated);
  }, []);

  return (
    <nav aria-label="Menu cepat" className="grid gap-2" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      {ITEMS.map((item) => {
        const showBadge = item.icon === "bell" && count > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 active:scale-[.97]"
          >
            <span className="relative flex h-8 w-8 items-center justify-center text-white/85 transition group-hover:text-gold-300 group-active:text-gold-200">
              <NavIcon name={item.icon} className="h-8 w-8" />
              {showBadge && (
                <span className="absolute -right-1.5 -top-1 min-w-[18px] rounded-full bg-danger-500 px-1 text-center text-[10px] font-black leading-[18px] text-white">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
            <span className="w-full min-w-0 break-words text-center text-[13px] font-medium leading-4 text-white/85 transition group-hover:text-white">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
