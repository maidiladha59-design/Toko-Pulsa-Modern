import Link from "next/link";
import Icon from "@/components/icons/Icon";
import VerifiedBadge from "@/components/icons/VerifiedBadge";
import { KYC_UI_LABELS, type KycUiStatus } from "@/lib/labels";

// Chip status verifikasi akun. Warna mengikuti token tema: emerald untuk
// terverifikasi, amber untuk menunggu, merah untuk ditolak.
const ICONS: Record<KycUiStatus, string> = {
  verified: "check_circle",
  unverified: "shield",
  pending: "hourglass",
  rejected: "warning",
};

const TONES: Record<"app" | "hero", Record<KycUiStatus, string>> = {
  app: {
    verified: "border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-300",
    unverified: "border-warning-500/30 bg-warning-500/10 text-warning-700 dark:text-warning-300",
    pending: "border-warning-500/30 bg-warning-500/10 text-warning-700 dark:text-warning-300",
    rejected: "border-danger-500/30 bg-danger-500/10 text-danger-700 dark:text-danger-300",
  },
  // Di atas hero gelap: latar semi-transparan gelap + teks terang, bukan pastel.
  hero: {
    verified: "border-[rgba(110,231,183,0.45)] bg-[rgba(16,185,129,0.20)] text-[#6ee7b7]",
    unverified: "border-[rgba(252,211,77,0.45)] bg-[rgba(245,158,11,0.20)] text-[#fcd34d]",
    pending: "border-[rgba(252,211,77,0.45)] bg-[rgba(245,158,11,0.20)] text-[#fcd34d]",
    rejected: "border-[rgba(252,165,165,0.45)] bg-[rgba(239,68,68,0.20)] text-[#fca5a5]",
  },
};

export default function KycChip({
  status,
  tone = "app",
  className = "",
}: {
  status: KycUiStatus;
  /** "hero" untuk area gelap beranda, "app" untuk kartu tema terang/gelap. */
  tone?: "app" | "hero";
  className?: string;
}) {
  const base = `inline-flex min-h-6 max-w-full items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-4 ${TONES[tone][status]} ${className}`;
  const content = (
    <>
      {status === "verified" ? (
        <VerifiedBadge size={16} className="shrink-0" />
      ) : (
        <Icon name={ICONS[status]} size={12} className="shrink-0" />
      )}
      <span className="min-w-0 break-words">{KYC_UI_LABELS[status]}</span>
    </>
  );

  // Hanya status yang perlu ditindaklanjuti yang bisa diketuk.
  if (status === "unverified" || status === "rejected") {
    return (
      <Link href="/kyc" className={`${base} transition hover:brightness-110`}>
        {content}
      </Link>
    );
  }
  return <span className={base}>{content}</span>;
}
