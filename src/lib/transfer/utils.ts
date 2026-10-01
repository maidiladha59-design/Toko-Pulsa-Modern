// Utilitas bersama fitur transfer saldo.
// Perhitungan biaya HARUS sama dengan create_wallet_transfer di
// supabase/migrations_v75_wallet_transfer_qr.sql:
//   - PERCENTAGE: ceil(amount * fee_value / 100)
//   - FIXED:      round(fee_value)

export type TransferFeeType = "FIXED" | "PERCENTAGE";

export function calcTransferFee(feeType: TransferFeeType | string, feeValue: number | string, amount: number): number {
  const value = typeof feeValue === "string" ? Number(feeValue) : feeValue;
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (feeType === "PERCENTAGE") return Math.ceil((amount * value) / 100);
  return Math.round(value);
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

export function maskName(name: string | null | undefined): string {
  if (!name || !name.trim()) return "Pengguna AIDIL STORE";
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (word.length <= 1 ? word : `${word[0]}${"*".repeat(Math.min(word.length - 1, 4))}`))
    .join(" ");
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "****";
  return `${digits.slice(0, 4)}${"*".repeat(Math.max(digits.length - 7, 2))}${digits.slice(-3)}`;
}

// Varian nomor telepon Indonesia agar pencarian exact-match tetap akurat
// meski format penulisan berbeda (0812..., 62812..., +62812...).
export function phoneVariants(raw: string): string[] {
  const trimmed = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{6,16}$/.test(trimmed)) return [];
  const digits = trimmed.replace(/^\+/, "");
  const variants = new Set<string>([digits]);
  if (digits.startsWith("0")) variants.add(`62${digits.slice(1)}`);
  if (digits.startsWith("62")) variants.add(`0${digits.slice(2)}`);
  return [...variants];
}
