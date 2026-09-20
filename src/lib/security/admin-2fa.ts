import crypto from "crypto";

// Cookie httpOnly yang membuktikan admin sudah lolos langkah OTP kedua (2FA),
// terpisah dari sesi Supabase (yang cuma membuktikan password benar).
export const ADMIN_2FA_COOKIE = "aidil_admin_2fa";
export const ADMIN_2FA_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 jam

function secret() {
  const s = process.env.OTP_PEPPER;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("OTP_PEPPER is not configured.");
  }
  return s || "aidil-store-development-only";
}

export function signAdmin2FAToken(userId: string): string {
  const expiresAt = Date.now() + ADMIN_2FA_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAt}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyAdmin2FAToken(token: string | undefined | null, userId: string): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [uid, expiresAtStr, sig] = decoded.split(".");
    if (!uid || !expiresAtStr || !sig) return false;
    if (uid !== userId) return false;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
    const expectedSig = crypto.createHmac("sha256", secret()).update(`${uid}.${expiresAtStr}`).digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
