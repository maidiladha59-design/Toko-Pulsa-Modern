// Label ramah pelanggan — satu sumber kebenaran untuk menampilkan status transaksi
// dan metode pembayaran.
//
// Aturan:
//  - Nama enum mentah (COMPLETED, PENDING, FAILED, ...) dan nama gateway/provider
//    (Midtrans, Digiflazz, FR3 Newera, AYANote, ...) HARAM muncul di antarmuka
//    pelanggan. Selalu render lewat fungsi di file ini.
//  - Panel admin boleh memakai istilah teknis apa adanya.
//  - Kunci lookup tetap memakai nama status database, jadi tidak ada perubahan
//    skema maupun logika di file ini.

const INTERNAL_TERMS = [
  "MIDTRANS", "DIGIFLAZZ", "FR3", "NEWERA", "AYANOTE", "XENDIT",
  "TRIPAY", "KREDIVO", "GATEWAY", "PROVIDER", "SUPPLIER", "WEBHOOK",
];

/** True kalau teks masih berisi istilah internal yang tidak boleh dibaca pelanggan. */
export function containsInternalTerm(text: string | null | undefined): boolean {
  const upper = String(text || "").toUpperCase();
  return INTERNAL_TERMS.some((term) => upper.includes(term));
}

const STATUS_LABELS: Record<string, string> = {
  // transaksi & top up
  PENDING: "Menunggu pembayaran",
  WAITING: "Menunggu pembayaran",
  VERIFYING: "Diproses",
  PROCESSING: "Diproses",
  ACTION_REQUIRED: "Perlu tindakan Anda",
  SUCCESS: "Berhasil",
  SUCCESSFUL: "Berhasil",
  COMPLETED: "Berhasil",
  SETTLED: "Berhasil",
  SETTLEMENT: "Berhasil",
  APPROVED: "Berhasil",
  PAID: "Berhasil",
  OK: "Berhasil",
  FAILED: "Gagal",
  ERROR: "Gagal",
  DENIED: "Gagal",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  CANCELED: "Dibatalkan",
  EXPIRED: "Dibatalkan",
  REFUNDED: "Dikembalikan ke saldo",
  // KYC & verifikasi akun
  KTP_SUBMITTED: "Data terkirim",
  SUBMITTED: "Menunggu verifikasi",
  VERIFIED: "Terverifikasi",
  UNDER_REVIEW: "Sedang diperiksa",
  INVALID: "Tidak valid",
  UNVERIFIED: "Belum diverifikasi",
  // status lain yang muncul di UI pelanggan
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  BLOCKED: "Diblokir",
  SUSPENDED: "Ditangguhkan",
  CLOSED: "Ditutup",
  OPEN: "Terbuka",
  ANSWERED: "Dijawab",
  READ: "Dibaca",
  UNREAD: "Belum dibaca",
  SENT: "Terkirim",
};

/**
 * Label status untuk pelanggan. Status tak dikenal tidak pernah ditampilkan
 * mentah: diubah jadi huruf biasa per kata, dan kalau masih terlihat teknis
 * dikembalikan ke teks umum.
 */
export function statusLabel(status: string | null | undefined, fallback = "Belum ada status"): string {
  const raw = String(status || "").trim();
  if (!raw) return fallback;
  const key = raw.toUpperCase().replaceAll("-", "_");
  const mapped = STATUS_LABELS[key];
  if (mapped) return mapped;
  if (!/^[A-Z0-9_ -]+$/.test(raw)) return raw; // sudah berupa teks manusiawi
  const humanized = key
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
  return containsInternalTerm(humanized) ? fallback : humanized;
}

/** Versi huruf besar untuk struk, tetap tanpa istilah internal. */
export function receiptStatusText(status: string | null | undefined): string {
  const label = statusLabel(status, "Diproses");
  return label === "Belum ada status" ? "Diproses" : label.toUpperCase();
}

const CHANNEL_LABELS: Record<string, string> = {
  qris: "QRIS",
  bca_va: "Virtual Account BCA",
  bni_va: "Virtual Account BNI",
  bri_va: "Virtual Account BRI",
  permata_va: "Virtual Account Permata",
  cimb_va: "Virtual Account CIMB Niaga",
  atm_bersama_va: "Virtual Account ATM Bersama",
  artha_graha_va: "Virtual Account Artha Graha",
  maybank_va: "Virtual Account Maybank",
  bnc_va: "Virtual Account BNC",
  sampoerna_va: "Virtual Account Sampoerna",
  manual_transfer: "Transfer Manual",
  manual: "Transfer Manual",
  balance: "Saldo AIDIL STORE",
  wallet: "Saldo AIDIL STORE",
  saldo: "Saldo AIDIL STORE",
};

/**
 * Nama metode pembayaran untuk pelanggan. Nama gateway/provider tidak pernah
 * dipakai: label dari admin dipakai kalau aman, lalu kode kanal, sisanya
 * "Top Up Otomatis".
 */
export function paymentMethodLabel(
  rawMethod: string | null | undefined,
  adminLabel?: string | null,
): string {
  const label = String(adminLabel || "").trim();
  if (label && !containsInternalTerm(label) && !/^[A-Z0-9_]+$/.test(label)) return label;
  const key = String(rawMethod || "").trim().toLowerCase().replaceAll(" ", "_");
  if (key && CHANNEL_LABELS[key] && !containsInternalTerm(CHANNEL_LABELS[key])) return CHANNEL_LABELS[key];
  if (key === "qris") return "QRIS";
  if (key.endsWith("_va") || key.includes("va_")) return "Virtual Account";
  if (key.includes("manual")) return "Transfer Manual";
  return "Top Up Otomatis";
}

/** Judul metode pembayaran pada daftar/riwayat — selalu nama kanal yang aman. */
export function paymentMethodTitle(rawMethod: string | null | undefined): string {
  return paymentMethodLabel(rawMethod);
}

// --- Istilah baku copywriting ------------------------------------------------
// Pakai konstanta ini supaya penulisan seragam di seluruh situs.
export const TERM = {
  topUp: "Top Up",
  topUpTitle: "Top Up Saldo",
  eWallet: "E-Wallet",
  balance: "Saldo",
  transaction: "Transaksi",
  transactions: "Transaksi",
  pin: "PIN",
  history: "Riwayat",
  automaticTopup: "Top Up Otomatis",
  manualTopup: "Top Up Manual",
} as const;

/** Nama produk/layanan dari database boleh ditampilkan, istilah internal tidak. */
export function safeProductName(name: string | null | undefined, fallback = "Produk"): string {
  const value = String(name || "").trim();
  if (!value || containsInternalTerm(value)) return fallback;
  return value;
}

/** Pesan gagal umum untuk pelanggan — detail asli cukup masuk log server. */
export const GENERIC_ERRORS = {
  load: "Gagal memuat. Coba lagi.",
  transactionFailed: "Transaksi gagal, saldo dikembalikan.",
  serviceDown: "Layanan sedang gangguan, coba lagi.",
  connection: "Koneksi bermasalah. Periksa internet Anda lalu coba lagi.",
} as const;
