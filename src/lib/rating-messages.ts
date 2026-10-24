const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Sesi kamu berakhir. Silakan login ulang.",
  RATING_FORBIDDEN: "Kamu hanya dapat menilai akun sendiri.",
  RATING_INVALID: "Pilih rating 1 sampai 5 bintang.",
  COMMENT_TOO_LONG: "Komentar maksimal 1000 karakter.",
  RATING_ALREADY_SUBMITTED: "Kamu sudah pernah mengirim rating. Terima kasih!",
  RATING_NOT_ELIGIBLE: "Rating tersedia setelah kamu menyelesaikan 10 transaksi.",
  ACCOUNT_BLOCKED: "Akun ini sedang diblokir sehingga belum dapat memberi rating.",
  PROFILE_NOT_FOUND: "Profil pengguna tidak ditemukan.",
  ADMIN_MISMATCH: "Sesi admin tidak cocok. Silakan login ulang.",
  ADMIN_ONLY: "Hanya admin yang dapat memoderasi ulasan.",
  RATING_NOT_FOUND: "Ulasan tidak ditemukan.",
};

export const RATING_SCHEMA_MISSING =
  "Fitur rating belum aktif di server. Jalankan migrasi v90 di Supabase.";

export function ratingMessage(raw: string | undefined | null, fallback: string): string {
  const message = String(raw || "");
  const code = Object.keys(MESSAGES).find((key) => message.includes(key));
  return code ? MESSAGES[code] : fallback;
}

// PostgREST mengembalikan PGRST202 bila function belum ada di schema cache.
export function isRatingRpcMissing(code: string | undefined | null): boolean {
  return code === "PGRST202";
}
