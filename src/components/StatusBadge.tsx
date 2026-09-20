const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  VERIFYING: "bg-gold-100 text-zinc-900",
  APPROVED: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  PROCESSING: "bg-gold-100 text-zinc-900",
  REJECTED: "bg-red-100 text-red-800",
  FAILED: "bg-red-100 text-red-800",
  EXPIRED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-gray-100 text-gray-600",
  REFUNDED: "bg-gold-100 text-zinc-900",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu verifikasi admin",
  VERIFYING: "Sedang diperiksa admin",
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
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[status] || "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}
