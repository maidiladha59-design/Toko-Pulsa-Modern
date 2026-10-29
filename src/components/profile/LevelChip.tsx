import Link from "next/link";
import Icon from "@/components/icons/Icon";
import { levelForCount, nextLevel, type LevelKey } from "@/config/levels";

// Warna tier memakai palet tema Tailwind; "gold" sengaja amber karena token
// gold-* di proyek ini sudah menjadi biru brand.
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
  const tier = levelForCount(transactions);
  const next = nextLevel(transactions);
  const hint = next
    ? `${next.remaining} transaksi lagi menuju ${next.tier.label}`
    : "Level tertinggi tercapai";

  return (
    <Link
      href="/ranking"
      title={hint}
      aria-label={`Level ${tier.label}. ${hint}`}
      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-4 transition hover:brightness-110 ${TIER_TONES[tier.key]} ${className}`}
    >
      <Icon name="star_fill" size={11} className="shrink-0" />
      <span className="whitespace-nowrap">Lv. {tier.label}</span>
    </Link>
  );
}
