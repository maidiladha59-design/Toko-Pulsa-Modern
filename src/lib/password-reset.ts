import { humanizeError } from "@/lib/utils";

export const RESET_CODE_COOLDOWN_SECONDS = 60;

const RESET_COOLDOWN_PREFIX = "aidilstore_reset_code_cooldown";

function cooldownKey(email: string) {
  return `${RESET_COOLDOWN_PREFIX}:${email.trim().toLowerCase()}`;
}

// Cooldown disimpan per email di sessionStorage agar reload halaman tidak
// langsung membuka kembali tombol kirim ulang.
export function readResetCooldown(email: string) {
  if (typeof window === "undefined" || !email.trim()) return 0;
  try {
    const until = Number(
      window.sessionStorage.getItem(cooldownKey(email)) || 0
    );
    const remaining = Math.ceil((until - Date.now()) / 1000);
    return remaining > 0
      ? Math.min(remaining, RESET_CODE_COOLDOWN_SECONDS)
      : 0;
  } catch {
    return 0;
  }
}

export function startResetCooldown(email: string) {
  if (typeof window === "undefined" || !email.trim()) return;
  try {
    window.sessionStorage.setItem(
      cooldownKey(email),
      String(Date.now() + RESET_CODE_COOLDOWN_SECONDS * 1000)
    );
  } catch {
    // sessionStorage bisa diblokir; cooldown state di komponen tetap berjalan.
  }
}

// Supabase bisa membalas "User not found" bila proteksi enumerasi email aktif.
// Balasan itu diperlakukan sebagai sukses agar status pendaftaran email tidak
// bisa ditebak dari halaman lupa password.
export function isEmailEnumerationError(message: string) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("user not found") ||
    m.includes("email not found") ||
    m.includes("not registered")
  );
}

export function friendlyPasswordResetError(message: string | undefined | null) {
  const m = (message || "").toLowerCase();

  if (
    m.includes("token has expired") ||
    m.includes("expired") ||
    m.includes("invalid token") ||
    (m.includes("otp") && m.includes("invalid"))
  )
    return "Kode salah atau sudah kedaluwarsa. Periksa kembali atau kirim ulang kode.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("email rate"))
    return "Terlalu banyak permintaan. Coba lagi beberapa menit lagi.";
  if (m.includes("session missing") || m.includes("not authenticated") || m.includes("jwt"))
    return "Sesi verifikasi tidak ditemukan atau sudah berakhir. Silakan minta kode verifikasi baru.";
  if (m.includes("different from the old"))
    return "Password baru harus berbeda dari password lama.";
  if (m.includes("at least") && m.includes("character"))
    return "Password minimal 8 karakter.";
  if (m.includes("weak") || m.includes("pwned"))
    return "Password terlalu lemah. Gunakan kombinasi huruf, angka, dan simbol.";

  return humanizeError(message);
}
