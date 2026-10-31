// Pemetaan tampilan transaksi: status mentah database tidak pernah dirender
// langsung. Semua label tetap berasal dari src/lib/labels.ts.

export type TransactionStatusKind = "success" | "processing" | "failed" | "neutral";

const SUCCESS_STATUSES = [
  "COMPLETED", "SUCCESS", "SUCCESSFUL", "SETTLED", "SETTLEMENT",
  "APPROVED", "PAID", "OK",
];
const PROCESSING_STATUSES = [
  "PENDING", "WAITING", "VERIFYING", "PROCESSING",
  "ACTION_REQUIRED", "UNDER_REVIEW", "SUBMITTED", "KTP_SUBMITTED",
];
const FAILED_STATUSES = [
  "FAILED", "ERROR", "DENIED", "REJECTED",
  "CANCELLED", "CANCELED", "EXPIRED", "REFUNDED",
];

export function transactionStatusKind(status: string | null | undefined): TransactionStatusKind {
  const key = String(status || "").trim().toUpperCase().replaceAll("-", "_");
  if (SUCCESS_STATUSES.includes(key)) return "success";
  if (PROCESSING_STATUSES.includes(key)) return "processing";
  if (FAILED_STATUSES.includes(key)) return "failed";
  return "neutral";
}

/** Nomor tujuan disamarkan di daftar; nilai penuh hanya di halaman detail. */
export function maskTarget(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) {
    const [name, domain] = raw.split("@");
    const visible = name.slice(0, Math.min(3, name.length));
    return `${visible}***@${domain}`;
  }
  const compact = raw.replace(/\s+/g, "");
  if (compact.length <= 4) return compact;
  if (compact.length >= 8) return `${compact.slice(0, 4)}****${compact.slice(-3)}`;
  return `${compact.slice(0, 2)}****${compact.slice(-2)}`;
}

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Jakarta",
});

const dayLabelFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export function transactionDayKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dayKeyFormatter.format(date);
}

export function transactionDayLabel(value: string | Date, now: Date = new Date()): string {
  const key = transactionDayKey(value);
  if (!key) return "";
  const today = transactionDayKey(now);
  const yesterday = transactionDayKey(new Date(now.getTime() - 86_400_000));
  if (key === today) return "Hari ini";
  if (key === yesterday) return "Kemarin";
  return dayLabelFormatter.format(value instanceof Date ? value : new Date(value));
}
