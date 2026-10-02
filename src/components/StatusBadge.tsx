const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  VERIFYING: "bg-gold-100 text-zinc-900 dark:bg-gold-400/15 dark:text-gold-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  PROCESSING: "bg-gold-100 text-zinc-900 dark:bg-gold-400/15 dark:text-gold-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  REFUNDED: "bg-gold-100 text-zinc-900 dark:bg-gold-400/15 dark:text-gold-300",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu pembayaran",
  VERIFYING: "Sedang diproses",
  APPROVED: "Berhasil",
  COMPLETED: "Selesai",
  PROCESSING: "Sedang diproses",
  REJECTED: "Ditolak",
  FAILED: "Gagal",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
  REFUNDED: "Dana dikembalikan",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status] || "bg-gray-100 text-gray-700 dark:bg-zinc-500/15 dark:text-zinc-300"}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}
