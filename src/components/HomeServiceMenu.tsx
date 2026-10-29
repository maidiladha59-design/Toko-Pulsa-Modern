"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import IconTile from "@/components/icons/IconTile";

type MediaItem = { category_key: string; icon_url: string | null };
type TabKey = "semua" | "layanan" | "tagihan" | "hiburan";

const TABS: { key: TabKey; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "layanan", label: "Layanan" },
  { key: "tagihan", label: "Tagihan" },
  { key: "hiburan", label: "Hiburan" },
];

const ITEMS: { icon: string; label: string; slug: string; tab: Exclude<TabKey, "semua"> }[] = [
  { icon: "pulsa", label: "Pulsa", slug: "pulsa", tab: "layanan" },
  { icon: "data", label: "Data", slug: "paket-data", tab: "layanan" },
  { icon: "game", label: "Game", slug: "top-up-game", tab: "hiburan" },
  { icon: "card", label: "E-Wallet", slug: "e-wallet", tab: "layanan" },
  { icon: "bolt", label: "PLN", slug: "pln", tab: "tagihan" },
  { icon: "voucher", label: "Voucher", slug: "voucher", tab: "hiburan" },
  { icon: "streaming", label: "Streaming", slug: "streaming", tab: "hiburan" },
  { icon: "tv", label: "TV", slug: "tv", tab: "tagihan" },
  { icon: "gas", label: "Gas", slug: "gas", tab: "tagihan" },
  { icon: "megaphone", label: "Sosmed", slug: "media-sosial", tab: "hiburan" },
];

export default function HomeServiceMenu({ media }: { media: MediaItem[] }) {
  const [active, setActive] = useState<TabKey>("semua");
  const visible = active === "semua" ? ITEMS : ITEMS.filter((item) => item.tab === active);

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
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.key)}
              className={`h-9 shrink-0 rounded-full px-2.5 text-[12px] transition sm:px-3 sm:text-[13px] ${
                isActive
                  ? "bg-gold-400 font-semibold text-zinc-950"
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
              key={item.slug}
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
