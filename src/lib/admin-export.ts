// Ekspor CSV panel admin — lapisan murni (tanpa I/O) supaya bisa dipakai
// route handler maupun komponen klien dan diuji tanpa Supabase.
//
// Aturan yang dijaga di file ini:
//  - Tanggal wajib dan rentang maksimal 31 hari (dihitung per hari WIB).
//  - Tanggal ditulis "2026-11-01 13:55 WIB".
//  - Nilai rupiah ditulis angka murni tanpa Rp/titik agar bisa dihitung Excel.
//  - Sel teks yang diawali = + - @ (atau tab/CR) diberi awalan ' supaya tidak
//    dieksekusi sebagai formula (CSV injection).
//  - Header memakai label Indonesia; data sensitif tidak pernah didaftarkan di
//    kolom mana pun (password, token, PIN, identitas KYC, data kartu).

export const EXPORT_MAX_DAYS = 31;
export const EXPORT_MAX_ROWS = 50_000;
export const EXPORT_BATCH_SIZE = 1_000;

export const EXPORT_KINDS = ["orders", "users", "topups", "finance"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

export const EXPORT_TITLES: Record<ExportKind, string> = {
  orders: "Pesanan",
  users: "Pengguna",
  topups: "Top Up",
  finance: "Keuangan",
};

export const EXPORT_FILE_SLUGS: Record<ExportKind, string> = {
  orders: "pesanan",
  users: "pengguna",
  topups: "top-up",
  finance: "keuangan",
};

/** Izin halaman yang tetap wajib di samping izin khusus "export". */
export const EXPORT_PAGE_PERMISSIONS: Record<ExportKind, string> = {
  orders: "orders.manage",
  users: "users.view",
  topups: "topups.manage",
  finance: "finance.view",
};

export const EXPORT_PERMISSION = "export";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Tanggal kalender WIB hari ini (YYYY-MM-DD), bukan tanggal server UTC. */
export function wibToday(now: Date = new Date()): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Rentang awal 7 hari WIB terakhir (termasuk hari ini) — masih di bawah 31 hari. */
export function defaultExportRange(now: Date = new Date()): { from: string; to: string } {
  const to = wibToday(now);
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 6 * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export type ExportRange =
  | { ok: true; from: string; to: string; days: number; startIso: string; endIso: string }
  | { ok: false; message: string };

/**
 * Memvalidasi rentang tanggal WIB dari query string. Batas 31 hari dihitung
 * inklusif supaya "1 Nov sampai 1 Des" ditolak, sedangkan 31 hari penuh lolos.
 */
export function parseExportRange(fromRaw: string | null, toRaw: string | null): ExportRange {
  const from = String(fromRaw || "").trim();
  const to = String(toRaw || "").trim();
  if (!from || !to) return { ok: false, message: "Rentang tanggal wajib dipilih sebelum ekspor." };
  if (!isValidDateInput(from) || !isValidDateInput(to)) {
    return { ok: false, message: "Format tanggal tidak valid. Gunakan tanggal WIB (YYYY-MM-DD)." };
  }
  if (from > to) {
    return { ok: false, message: "Tanggal awal harus sebelum atau sama dengan tanggal akhir." };
  }
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  const days =
    Math.round(
      (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / DAY_MS
    ) + 1;
  if (days > EXPORT_MAX_DAYS) {
    return {
      ok: false,
      message: `Rentang tanggal maksimal ${EXPORT_MAX_DAYS} hari per ekspor.`,
    };
  }
  const startIso = new Date(Date.parse(`${from}T00:00:00+07:00`)).toISOString();
  const endIso = new Date(Date.parse(`${to}T23:59:59.999+07:00`)).toISOString();
  return { ok: true, from, to, days, startIso, endIso };
}

/** ISO timestamp UTC menjadi "2026-11-01 13:55 WIB" tanpa bergantung zona server. */
export function formatWibDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  return (
    `${wib.getUTCFullYear()}-${pad2(wib.getUTCMonth() + 1)}-${pad2(wib.getUTCDate())} ` +
    `${pad2(wib.getUTCHours())}:${pad2(wib.getUTCMinutes())} WIB`
  );
}

const CSV_INJECTION_PREFIX = /^[\t\r ]*[=+\-@]/;

function quoteCsv(text: string): string {
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Sel teks CSV. Sel yang berpotensi formula diberi awalan ' lalu dikutip;
 * kutip ganda di-escape menjadi "", dan koma/baris baru dibungkus kutip.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!text) return "";
  if (CSV_INJECTION_PREFIX.test(text)) return quoteCsv(`'${text}`);
  return quoteCsv(text);
}

/** Sel angka/rupiah: angka murni tanpa pemisah ribuan, Rp, atau kutip formula. */
export function csvNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

export type ExportRow = Record<string, any>;

export type ExportColumn = {
  header: string;
  value: (row: ExportRow) => unknown;
  numeric?: boolean;
};

const ORDER_STATUS_OPTIONS = [
  { value: "PENDING", label: "Menunggu pembayaran" },
  { value: "PROCESSING", label: "Diproses" },
  { value: "COMPLETED", label: "Berhasil" },
  { value: "FAILED", label: "Gagal" },
  { value: "CANCELLED", label: "Dibatalkan" },
  { value: "REFUNDED", label: "Dikembalikan ke saldo" },
];

const TOPUP_STATUS_OPTIONS = [
  { value: "PENDING", label: "Menunggu pembayaran" },
  { value: "VERIFYING", label: "Diproses" },
  { value: "APPROVED", label: "Berhasil" },
  { value: "REJECTED", label: "Ditolak" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "FAILED", label: "Gagal" },
];

export const EXPORT_STATUS_OPTIONS: Record<ExportKind, { value: string; label: string }[]> = {
  orders: ORDER_STATUS_OPTIONS,
  users: [
    { value: "ACTIVE", label: "Aktif" },
    { value: "BLOCKED", label: "Diblokir" },
  ],
  topups: TOPUP_STATUS_OPTIONS,
  finance: [
    { value: "ORDER_SALE", label: "Penjualan Pesanan" },
    { value: "ORDER_REFUND", label: "Refund Pesanan" },
    { value: "TOPUP_FEE", label: "Fee Top Up" },
  ],
};

const ORDER_STATUS_LABELS = new Map(ORDER_STATUS_OPTIONS.map((o) => [o.value, o.label]));
const TOPUP_STATUS_LABELS = new Map(TOPUP_STATUS_OPTIONS.map((o) => [o.value, o.label]));
const FINANCE_EVENT_LABELS = new Map(EXPORT_STATUS_OPTIONS.finance.map((o) => [o.value, o.label]));

const SOURCE_LABELS: Record<string, string> = {
  order: "Pesanan",
  topup: "Top Up",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  QRIS: "QRIS",
  SALDO: "Saldo AIDIL STORE",
  BALANCE: "Saldo AIDIL STORE",
  WALLET: "Saldo AIDIL STORE",
};

function paymentMethodLabel(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return PAYMENT_METHOD_LABELS[raw.toUpperCase()] || raw;
}

function statusLabel(map: Map<string, string>, value: unknown): string {
  const raw = String(value || "").trim();
  return map.get(raw) || raw;
}

export const EXPORT_COLUMNS: Record<ExportKind, ExportColumn[]> = {
  orders: [
    { header: "Nomor Pesanan", value: (r) => r.order_number },
    { header: "Nama Pelanggan", value: (r) => r.profiles?.full_name },
    { header: "Email Pelanggan", value: (r) => r.profiles?.email },
    { header: "Metode Pembayaran", value: (r) => paymentMethodLabel(r.payment_method) },
    { header: "Total (Rp)", value: (r) => r.total_amount, numeric: true },
    { header: "Status", value: (r) => statusLabel(ORDER_STATUS_LABELS, r.status) },
    { header: "Waktu Dibuat", value: (r) => formatWibDateTime(r.created_at) },
  ],
  users: [
    { header: "ID Pengguna", value: (r) => r.id },
    { header: "Nama", value: (r) => r.full_name },
    { header: "Email", value: (r) => r.email },
    { header: "Role", value: (r) => r.role },
    { header: "Status Akun", value: (r) => (r.account_status === "BLOCKED" ? "Diblokir" : "Aktif") },
    { header: "Saldo (Rp)", value: (r) => r.balance, numeric: true },
    { header: "Tanggal Bergabung", value: (r) => formatWibDateTime(r.created_at) },
  ],
  topups: [
    { header: "ID Top Up", value: (r) => r.id },
    { header: "Nama Pengguna", value: (r) => r.profiles?.full_name },
    { header: "Email Pengguna", value: (r) => r.profiles?.email },
    { header: "Nominal (Rp)", value: (r) => r.amount, numeric: true },
    { header: "Biaya Admin (Rp)", value: (r) => r.admin_fee, numeric: true },
    {
      header: "Biaya Gateway (Rp)",
      value: (r) => r.gateway_fee,
      numeric: true,
    },
    {
      header: "Total Dibayar (Rp)",
      value: (r) => r.gateway_total_payment ?? r.payment_amount ?? r.amount,
      numeric: true,
    },
    { header: "Metode Pembayaran", value: (r) => paymentMethodLabel(r.payment_method) },
    { header: "Penyedia", value: (r) => r.provider },
    { header: "Status", value: (r) => statusLabel(TOPUP_STATUS_LABELS, r.status) },
    { header: "Waktu Dibuat", value: (r) => formatWibDateTime(r.created_at) },
  ],
  finance: [
    { header: "Waktu", value: (r) => formatWibDateTime(r.occurred_at) },
    { header: "Jenis", value: (r) => statusLabel(FINANCE_EVENT_LABELS, r.event_type) },
    { header: "Sumber", value: (r) => SOURCE_LABELS[String(r.source_type)] || r.source_type },
    { header: "ID Sumber", value: (r) => r.source_id },
    { header: "ID Pengguna", value: (r) => r.user_id },
    { header: "Gross (Rp)", value: (r) => r.gross_amount, numeric: true },
    { header: "Biaya Provider (Rp)", value: (r) => r.provider_cost, numeric: true },
    { header: "Biaya Gateway (Rp)", value: (r) => r.gateway_cost, numeric: true },
    { header: "Fee (Rp)", value: (r) => r.fee_revenue, numeric: true },
    { header: "Profit Bersih (Rp)", value: (r) => r.net_profit, numeric: true },
  ],
};

export function exportColumns(kind: ExportKind): ExportColumn[] {
  return EXPORT_COLUMNS[kind];
}

export function csvHeader(columns: ExportColumn[]): string {
  return columns.map((column) => csvCell(column.header)).join(",");
}

export function csvLine(row: ExportRow, columns: ExportColumn[]): string {
  return columns
    .map((column) => {
      const value = column.value(row);
      return column.numeric ? csvNumber(value) : csvCell(value);
    })
    .join(",");
}

export function exportFilename(kind: ExportKind, from: string, to: string): string {
  return `aidil-store-${EXPORT_FILE_SLUGS[kind]}-${from}-${to}.csv`;
}

export function exportRowLimitMessage(total: number): string {
  return `Ekspor dibatasi ${EXPORT_MAX_ROWS.toLocaleString("id-ID")} baris, sedangkan filter ini menghasilkan ${total.toLocaleString("id-ID")} baris. Persempit rentang tanggal atau filter, lalu coba lagi.`;
}
