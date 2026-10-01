// Format payload QR Pribadi AIDIL STORE:
//   https://<host>/transfer-uang?qr=<token-64-hex>[&amount=<nominal>]
// Token bersifat publik (64 hex acak) — TIDAK berisi email, saldo,
// atau data pribadi. Nominal opsional untuk QR "tagihan".

export const PERSONAL_QR_PATH = "/transfer-uang";
const QR_TOKEN_REGEX = /^[a-f0-9]{64}$/;

export type PersonalQrPayload = { token: string; amount: number | null };

export function isValidQrToken(value: unknown): value is string {
  return typeof value === "string" && QR_TOKEN_REGEX.test(value.trim().toLowerCase());
}

export function buildPersonalQrPayload(origin: string, token: string, amount?: number | null): string {
  const base = `${origin.replace(/\/+$/, "")}${PERSONAL_QR_PATH}?qr=${token}`;
  if (amount && Number.isSafeInteger(amount) && amount > 0) {
    return `${base}&amount=${amount}`;
  }
  return base;
}

// Dipakai oleh halaman scan (kamera) dan halaman transfer (searchParams).
// Menerima payload URL penuh maupun token mentah 64 hex.
export function parsePersonalQrPayload(raw: string): PersonalQrPayload | null {
  if (!raw) return null;
  const text = raw.trim();

  if (QR_TOKEN_REGEX.test(text.toLowerCase())) {
    return { token: text.toLowerCase(), amount: null };
  }

  let url: URL;
  try {
    url = new URL(text.startsWith("/") ? `https://aidil.store${text}` : text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== PERSONAL_QR_PATH) return null;

  const token = url.searchParams.get("qr");
  if (!isValidQrToken(token)) return null;

  let amount: number | null = null;
  const amountRaw = url.searchParams.get("amount");
  if (amountRaw && /^\d{1,12}$/.test(amountRaw)) {
    const parsed = Number(amountRaw);
    if (Number.isSafeInteger(parsed) && parsed > 0) amount = parsed;
  }

  return { token: token.trim().toLowerCase(), amount };
}
