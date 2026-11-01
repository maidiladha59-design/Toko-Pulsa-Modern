"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import IconTile from "@/components/icons/IconTile";
import { SERVICE_TABS, type HomeServiceItem, type ServiceTabKey } from "@/config/service-categories";

// Menu layanan beranda. Daftar, label, ikon, urutan, dan kategori tab berasal
// dari pengaturan beranda (src/config/service-categories.ts sebagai default).
// Gambar kategori lama (category_media) tetap dipakai bila tersedia.

type MediaItem = { category_key: string; icon_url: string | null };
type TabKey = "semua" | ServiceTabKey;

export default function HomeServiceMenu({ items, media }: { items: HomeServiceItem[]; media: MediaItem[] }) {
  const [active, setActive] = useState<TabKey>("semua");

  if (items.length === 0) return null;

  const presentTabs = new Set<ServiceTabKey>(items.map((item) => item.tab));
  const tabs: { key: TabKey; label: string }[] = [
    { key: "semua", label: "Semua" },
    ...SERVICE_TABS.filter((tab) => presentTabs.has(tab.key)),
  ];
  const effectiveActive: TabKey = tabs.some((tab) => tab.key === active) ? active : "semua";
  const visible = effectiveActive === "semua" ? items : items.filter((item) => item.tab === effectiveActive);

  return (
    <section className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-app-border pb-3">
        <h2 className="text-lg font-semibold text-app-text">Layanan</h2>
        <Link href="/layanan" className="text-[13px] font-medium text-app-kicker hover:underline">
          Lihat semua
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Kategori layanan"
        className="mt-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === effectiveActive;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.key)}
              className={`h-9 shrink-0 rounded-full px-2.5 text-[12px] transition sm:px-3 sm:text-[13px] ${
                isActive
                  ? "bg-gold-400 font-semibold text-app-on-primary"
                  : "border border-app-border font-medium text-app-muted hover:border-gold-400/50 hover:text-app-text"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-8">
        {visible.map((item) => {
          const iconUrl = media.find((row) => row.category_key === item.slug)?.icon_url;
          return (
            <Link
              key={item.id}
              href={`/ppob/${item.slug}`}
              className="flex min-h-[76px] flex-col items-center rounded-xl px-1 py-1 text-center transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
            >
              {iconUrl ? (
                <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-app-inset">
                  <Image src={iconUrl} alt={item.label} width={48} height={48} className="h-full w-full object-contain" />
                </span>
              ) : (
                <IconTile name={item.icon} size={48} iconSize={24} />
              )}
              <span className="mt-1.5 flex min-h-[2.4rem] items-start justify-center text-[13px] font-medium leading-[1.15rem] text-app-muted">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
