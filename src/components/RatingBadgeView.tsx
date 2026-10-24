import Link from "next/link";
import type { RatingSummary } from "@/lib/ratings";

export default function RatingBadgeView({
  summary,
  showEmpty = false,
  className = "",
}: {
  summary: RatingSummary;
  showEmpty?: boolean;
  className?: string;
}) {
  if (summary.totalCount === 0 && !showEmpty) return null;

  const label =
    summary.totalCount > 0
      ? `⭐ ${summary.average.toFixed(1)} dari ${summary.totalCount} ulasan`
      : "⭐ Belum ada ulasan";

  return (
    <Link
      href="/ulasan"
      className={`inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-app-surface px-4 py-2 text-sm font-black text-app-text shadow-sm transition hover:border-gold-400 hover:bg-app-accent-soft ${className}`}
    >
      <span>{label}</span>
      <span aria-hidden className="text-app-kicker">
        →
      </span>
    </Link>
  );
}
