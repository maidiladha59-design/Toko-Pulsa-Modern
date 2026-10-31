import { statusLabel } from "@/lib/labels";

// Satu pemetaan warna untuk semua status transaksi:
// Berhasil = hijau, Diproses = kuning, Gagal = merah,
// Dibatalkan = abu-abu, Dikembalikan ke saldo = biru.
const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-warning-100 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
  WAITING: "bg-warning-100 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
  VERIFYING: "bg-warning-100 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
  PROCESSING: "bg-warning-100 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
  ACTION_REQUIRED: "bg-warning-100 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
  UNDER_REVIEW: "bg-warning-100 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  SUCCESS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  SUCCESSFUL: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  SETTLED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  SETTLEMENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  ERROR: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  DENIED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  CANCELED: "bg-gray-100 text-gray-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  CLOSED: "bg-gray-100 text-gray-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  REFUNDED: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
};

// Label selalu dari src/lib/labels.ts — nama status database tidak pernah tampil.
export default function StatusBadge({ status }: { status: string }) {
  const key = String(status || "").trim().toUpperCase().replaceAll("-", "_");
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-4 ${
        STATUS_STYLES[key] || "bg-gray-100 text-gray-700 dark:bg-zinc-500/15 dark:text-zinc-300"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}
