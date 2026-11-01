"use client";

import Link from "next/link";
import Icon from "@/components/icons/Icon";
import { levelForTiers, nextTierForCount } from "@/lib/level-tiers";
import { levelForCount, nextLevel, type LevelKey } from "@/config/levels";
import { useLevelKyc } from "@/components/settings/LevelKycProvider";

// Warna tier memakai palet tema Tailwind; "gold" sengaja amber karena token
// gold-* di proyek ini sudah menjadi biru brand. Dipakai hanya bila pengaturan
// level belum tersedia (fallback ke src/config/levels.ts).
// Latar semi-transparan gelap + teks terang agar chip tetap terbaca di atas
// kartu hero yang selalu gelap, termasuk di mode terang.
const TIER_TONES: Record<LevelKey, string> = {
  bronze: "border-[rgba(252,211,77,0.45)] bg-[rgba(245,158,11,0.20)] text-[#fcd34d]",
  silver: "border-[rgba(228,228,231,0.45)] bg-[rgba(255,255,255,0.12)] text-[#e4e4e7]",
  gold: "border-[rgba(252,211,77,0.45)] bg-[rgba(245,158,11,0.20)] text-[#fcd34d]",
  platinum: "border-[rgba(125,211,252,0.45)] bg-[rgba(14,165,233,0.20)] text-[#7dd3fc]",
  diamond: "border-[rgba(196,181,253,0.45)] bg-[rgba(139,92,246,0.20)] text-[#c4b5fd]",
};

export default function LevelChip({
  transactions,
  className = "",
  linkable = true,
}: {
  transactions: number;
  className?: string;
  /** false untuk chip di dalam kartu yang sudah berupa tautan (hindari anchor bersarang). */
  linkable?: boolean;
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

  const content = (
    <>
      <Icon name={icon} size={11} className="shrink-0" />
      <span className="whitespace-nowrap">Lv. {tier.label}</span>
    </>
  );

  if (!linkable) {
    return (
      <span
        title={hint}
        aria-label={`Level ${tier.label}. ${hint}`}
        style={colorStyle}
        className={`inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-4 ${tone} ${className}`}
      >
        {content}
      </span>
    );
  }

  return (
    <Link
      href="/ranking"
      title={hint}
      aria-label={`Level ${tier.label}. ${hint}`}
      style={colorStyle}
      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-4 transition hover:brightness-110 ${tone} ${className}`}
    >
      {content}
    </Link>
  );
}
