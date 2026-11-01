"use client";

import Link from "next/link";
import Icon from "@/components/icons/Icon";
import { levelForTiers, nextTierForCount } from "@/lib/level-tiers";
import { levelForCount, nextLevel, type LevelKey } from "@/config/levels";
import { useLevelKyc } from "@/components/settings/LevelKycProvider";

// Warna tier memakai palet tema Tailwind; "gold" sengaja amber karena token
// gold-* di proyek ini sudah menjadi biru brand. Dipakai hanya bila pengaturan
// level belum tersedia (fallback ke src/config/levels.ts).
const TIER_TONES: Record<LevelKey, string> = {
  bronze: "border-orange-400/30 bg-orange-500/10 text-orange-300",
  silver: "border-zinc-300/30 bg-white/10 text-zinc-200",
  gold: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  platinum: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  diamond: "border-violet-400/30 bg-violet-400/10 text-violet-300",
};

export default function LevelChip({
  transactions,
  className = "",
}: {
  transactions: number;
  className?: string;
}) {
  const settings = useLevelKyc();
  const configured = settings !== null && settings.levels.length > 0;
  const tier = configured ? levelForTiers(transactions, settings.levels) : levelForCount(transactions);
  const next = configured ? nextTierForCount(transactions, settings.levels) : nextLevel(transactions);
  const hint = next
    ? `${next.remaining} transaksi lagi menuju ${next.tier.label}`
    : "Level tertinggi tercapai";
  const icon = configured && "icon" in tier ? tier.icon : "star_fill";
  const tone = configured && "color" in tier ? "" : TIER_TONES[(tier as { key: LevelKey }).key];
  const colorStyle =
    configured && "color" in tier
      ? { borderColor: `${tier.color}55`, backgroundColor: `${tier.color}1a`, color: tier.color }
      : undefined;

  return (
    <Link
      href="/ranking"
      title={hint}
      aria-label={`Level ${tier.label}. ${hint}`}
      style={colorStyle}
      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-4 transition hover:brightness-110 ${tone} ${className}`}
    >
      <Icon name={icon} size={11} className="shrink-0" />
      <span className="whitespace-nowrap">Lv. {tier.label}</span>
    </Link>
  );
}
