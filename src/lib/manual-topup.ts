// Konstanta Top Up Manual — dipakai API, halaman pelanggan, dan panel admin.
// Tidak menyimpan kredensial apa pun; bucket & pesan error sengaja terpusat.

export const MANUAL_TOPUP_CHANNEL_TYPES = [
  "DANA",
  "GOPAY",
  "SHOPEEPAY",
  "BANK_JAGO",
  "BLU_BCA",
  "QRIS",
  "LAINNYA",
] as const;

export type ManualTopupChannelType = (typeof MANUAL_TOPUP_CHANNEL_TYPES)[number];

export const MANUAL_TOPUP_CHANNEL_LABELS: Record<ManualTopupChannelType, string> = {
  DANA: "DANA",
  GOPAY: "GoPay",
  SHOPEEPAY: "ShopeePay",
  BANK_JAGO: "Bank Jago",
  BLU_BCA: "blu by BCA Digital",
  QRIS: "QRIS",
  LAINNYA: "Lainnya",
};

export const MANUAL_TOPUP_CHANNEL_ICONS: Record<ManualTopupChannelType, string> = {
  DANA: "DA",
  GOPAY: "GP",
  SHOPEEPAY: "SP",
  BANK_JAGO: "BJ",
  BLU_BCA: "BL",
  QRIS: "QR",
  LAINNYA: "LN",
};

export const MANUAL_PROOF_BUCKET = "manual-topup-proofs";
export const MANUAL_QRIS_BUCKET = "qris-images";
export const MANUAL_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const MANUAL_PROOF_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MANUAL_PROOF_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Pesan ramah pelanggan/admin untuk kode error dari RPC.
export const MANUAL_TOPUP_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: "Silakan login terlebih dahulu.",
  USER_ID_MISMATCH: "Sesi pengguna tidak valid. Muat ulang halaman lalu coba lagi.",
  ACCOUNT_BLOCKED: "Akun Anda sedang diblokir sehingga tidak dapat melakukan Top Up Manual.",
  INVALID_AMOUNT: "Nominal Top Up tidak valid.",
  MANUAL_TOPUP_DISABLED: "Top Up Manual sedang dinonaktifkan oleh admin.",
  BELOW_MIN_AMOUNT: "Nominal Top Up di bawah batas minimum.",
  ABOVE_MAX_AMOUNT: "Nominal Top Up melebihi batas maksimum.",
  CHANNEL_NOT_AVAILABLE: "Channel pembayaran ini sedang tidak tersedia. Pilih channel lain.",
  PROOF_REQUIRED: "Bukti transfer wajib diunggah.",
  INVALID_PROOF_PATH: "Bukti transfer tidak valid. Unggah ulang bukti transfer.",
  REQUEST_NOT_FOUND: "Permintaan Top Up tidak ditemukan.",
  REQUEST_ALREADY_PROCESSED: "Permintaan ini sudah diproses sebelumnya.",
  NOTE_REQUIRED: "Alasan penolakan wajib diisi minimal 5 karakter.",
  INVALID_ACTION: "Aksi admin tidak valid.",
  ADMIN_ONLY: "Akses admin ditolak.",
  ADMIN_MISMATCH: "Sesi admin tidak valid. Muat ulang halaman.",
  USER_NOT_FOUND: "Pengguna tidak ditemukan.",
  WALLET_NOT_FOUND: "Dompet pengguna tidak ditemukan.",
};

export function isManualChannelType(value: unknown): value is ManualTopupChannelType {
  return typeof value === "string" && (MANUAL_TOPUP_CHANNEL_TYPES as readonly string[]).includes(value);
}
