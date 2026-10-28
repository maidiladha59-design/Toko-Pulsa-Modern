import type { ReactNode } from "react";

// Badge status Design System AIDIL STORE — warna semantik konsisten untuk
// status transaksi di seluruh situs (bukan warna acak per halaman):
//   success = Berhasil (emerald) · danger = Gagal/Ditolak · warning = Pending/Menunggu
//   neutral = Kadaluarsa/Dibatalkan · gold = Diproses/brand (biru, nama legacy)
//   mint = aksen/highlight aktif (hijau muda brand, BUKAN status Berhasil)
// Pakai helper statusTone() supaya pemetaan status → warna seragam:
//   <Badge tone={statusTone(order.status)}>{label}</Badge>

export type BadgeTone = "success" | "danger" | "warning" | "neutral" | "gold" | "mint";

const TONES: Record<BadgeTone, string> = {
  success: "bg-success-100 text-success-800 dark:bg-success-500/15 dark:text-success-300",
  danger: "bg-danger-100 text-danger-800 dark:bg-danger-500/15 dark:text-danger-300",
  warning: "bg-warning-100 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  gold: "bg-gold-100 text-gold-800 dark:bg-gold-400/15 dark:text-gold-300",
  mint: "bg-mint-100 text-mint-800 dark:bg-mint-400/15 dark:text-mint-300",
};

// Pemetaan status internal (orders/topups/ppob) → tone semantik.
export function statusTone(status: string | null | undefined): BadgeTone {
  const s = String(status || "").toUpperCase();
  if (["SUCCESS", "COMPLETED", "APPROVED", "SETTLEMENT", "PAID"].includes(s)) return "success";
  if (["FAILED", "REJECTED", "DENIED", "ERROR"].includes(s)) return "danger";
  if (["PENDING", "WAITING"].includes(s)) return "warning";
  if (["EXPIRED", "CANCELLED", "CANCELED"].includes(s)) return "neutral";
  if (["PROCESSING", "VERIFYING", "REFUNDED"].includes(s)) return "gold";
  return "gold";
}

// Label status bahasa Indonesia diambil dari satu sumber: src/lib/labels.ts.
export { statusLabel } from "@/lib/labels";

export default function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
