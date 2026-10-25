export const COMMUNITY_CHAT_MAX_LENGTH = 1000;
export const COMMUNITY_CHAT_REALTIME_TOPIC = "community-chat";

export type CommunityChatMessage = {
  id: string;
  user_id: string;
  message: string;
  is_deleted?: boolean;
  created_at: string;
};

export type CommunityChatMember = {
  user_id: string;
  display_name: string;
};

export const COMMUNITY_CHAT_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: "Sesi login tidak valid. Silakan login ulang.",
  USER_ID_MISMATCH: "Sesi login tidak valid. Silakan login ulang.",
  ACCOUNT_BLOCKED: "Akun kamu sedang diblokir sehingga tidak bisa mengirim pesan.",
  INVALID_MESSAGE: "Pesan tidak boleh kosong.",
  MESSAGE_TOO_LONG: "Pesan maksimal 1000 karakter.",
  CHAT_RATE_LIMIT: "Tunggu sebentar sebelum kirim pesan lagi.",
};

export const COMMUNITY_CHAT_ADMIN_ERRORS: Record<string, string> = {
  UNAUTHENTICATED: "Silakan login kembali.",
  ADMIN_MISMATCH: "Sesi admin tidak valid. Silakan login kembali.",
  ADMIN_ONLY: "Akses admin ditolak.",
  MESSAGE_NOT_FOUND: "Pesan tidak ditemukan atau sudah dihapus.",
  USER_NOT_FOUND: "Pengguna tidak ditemukan.",
  REASON_REQUIRED: "Alasan wajib diisi saat membisukan pengguna.",
};

function rawCode(message: string) {
  const raw = String(message || "");
  return Object.keys(COMMUNITY_CHAT_ERRORS)
    .concat(Object.keys(COMMUNITY_CHAT_ADMIN_ERRORS))
    .find((code) => raw.includes(code)) || "";
}

export function mutedChatMessage(reason?: string | null) {
  const clean = String(reason || "").trim();
  return clean
    ? `Kamu dibisukan dari ruang diskusi. Alasan: ${clean}`
    : "Kamu dibisukan dari ruang diskusi. Alasan: tidak disebutkan admin.";
}

export function chatErrorMessage(message: string) {
  const raw = String(message || "");

  if (raw.includes("CHAT_MUTED")) {
    const reason = raw.split("CHAT_MUTED").slice(1).join("CHAT_MUTED").replace(/^[:\s-]+/, "").trim();
    return mutedChatMessage(reason);
  }

  const code = rawCode(raw);
  if (code) return COMMUNITY_CHAT_ERRORS[code] || COMMUNITY_CHAT_ADMIN_ERRORS[code];

  return "Gagal mengirim pesan. Periksa koneksi lalu coba lagi.";
}

export function chatAdminErrorMessage(message: string) {
  const raw = String(message || "");
  const code = rawCode(raw);
  return COMMUNITY_CHAT_ADMIN_ERRORS[code] || "Aksi moderasi gagal. Silakan coba lagi.";
}

export function chatMutedReason(message: string) {
  const raw = String(message || "");
  if (!raw.includes("CHAT_MUTED")) return null;
  return raw.split("CHAT_MUTED").slice(1).join("CHAT_MUTED").replace(/^[:\s-]+/, "").trim();
}
