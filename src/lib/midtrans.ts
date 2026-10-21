// Integrasi Midtrans Core API (v2) — dibangun ulang dari dokumentasi resmi.
// Referensi: https://docs.midtrans.com (Core API, Code 2xx/4xx, Webhook, Idempotency).
//
// Fakta API yang dipatuhi modul ini (diverifikasi dari dokumentasi resmi):
// 1. Endpoint: POST {baseUrl}/v2/charge dan GET {baseUrl}/v2/{order_id|transaction_id}/status.
//    baseUrl produksi https://api.midtrans.com, sandbox https://api.sandbox.midtrans.com.
//    Autentikasi Basic Auth: username = Server Key, password kosong.
// 2. Struktur charge per metode:
//    - QRIS:             payment_type "qris" + qris { acquirer } (objek opsional).
//    - BCA/BNI/BRI/CIMB: payment_type "bank_transfer" + bank_transfer { bank }.
//    - Permata:          payment_type "permata" TANPA objek bank_transfer; respons memuat
//                        permata_va_number (bukan va_numbers).
//    - Mandiri Bill:     payment_type "echannel" + echannel { bill_info1, bill_info2 };
//                        respons memuat bill_key + biller_code.
// 3. Midtrans memakai status_code DI DALAM BODY yang bisa berbeda dengan HTTP status:
//    200 sukses, 201 pending (transaksi dibuat, menunggu pembayaran), 202 denied,
//    400 validasi, 401 kredensial salah, 402 channel tidak aktif di akun merchant,
//    404 transaksi tidak ditemukan, 406 order_id sudah pernah dipakai, 407 transaksi
//    kedaluwarsa, 410 akun pembayar diblokir, 429 rate limit.
// 4. Signature notifikasi: SHA512(order_id + status_code + gross_amount + ServerKey).
// 5. Header Idempotency-Key (opsional, maks 46 karakter) membuat retry POST aman;
//    tidak didukung untuk Permata VA.
// 6. Core API GoPay sengaja TIDAK diintegrasikan (hanya deeplink aplikasi Gojek).
// 7. Kredensial HANYA dari environment variable — tidak ada nilai yang di-hardcode
//    dan tidak ada default untuk Server Key. Log tidak pernah memuat kredensial.

import crypto from "node:crypto";
import QRCode from "qrcode";

const REQUEST_TIMEOUT_MS = 15000;
const QR_RENDER_WIDTH = 360;
// Batas aman supaya kolom payment_number/qris_payload (text) tidak membengkak.
const MAX_QR_IMAGE_BYTES = 200 * 1024;
const DEFAULT_EXPIRY_MINUTES = 60;
// Default kedaluwarsa Virtual Account Midtrans adalah 24 jam.
const DEFAULT_VA_EXPIRY_MINUTES = 1440;

export const GATEWAY_PROVIDER = "midtrans";

export const GATEWAY_METHODS = ["qris", "bca_va", "bni_va", "bri_va", "permata_va"] as const;

export type GatewayMethod = (typeof GATEWAY_METHODS)[number];

export function isGatewayMethod(value: unknown): value is GatewayMethod {
  return (GATEWAY_METHODS as readonly string[]).includes(String(value ?? ""));
}

// =========================================================
// Konfigurasi (env only)
// =========================================================

type MidtransConfig = {
  serverKey: string;
  clientKey: string;
  isProduction: boolean;
  baseUrl: string;
};

function readConfig(): MidtransConfig {
  const serverKey = String(process.env.MIDTRANS_SERVER_KEY || "").trim();
  const clientKey = String(process.env.MIDTRANS_CLIENT_KEY || "").trim();
  const isProduction = ["true", "1", "yes"].includes(
    String(process.env.MIDTRANS_IS_PRODUCTION || "").trim().toLowerCase()
  );
  return {
    serverKey,
    clientKey,
    isProduction,
    baseUrl: isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com",
  };
}

export function isGatewayConfigured() {
  return Boolean(readConfig().serverKey);
}

// =========================================================
// Tipe inti (API baru)
// =========================================================

export type MidtransPaymentType = "qris" | "bank_transfer" | "permata" | "echannel";

export type MidtransItemDetail = { id: string; name: string; price: number; quantity?: number };

export type MidtransChargeRequest = {
  orderId: string;
  grossAmount: number;
  paymentType: MidtransPaymentType;
  // Wajib untuk bank_transfer: nama bank perolehan (acquiring bank).
  bank?: "bca" | "bni" | "bri" | "cimb";
  // QRIS: acquirer (mis. "gopay"). Kosong = acquirer default merchant.
  acquirer?: string;
  // echannel (Mandiri Bill): label maks 10 karakter, nilai maks 30 karakter.
  billInfo1?: string;
  billInfo2?: string;
  expiryMinutes?: number;
  itemDetails?: MidtransItemDetail[];
  // Header Idempotency-Key Midtrans (maks 46 karakter; tidak berlaku untuk Permata).
  idempotencyKey?: string;
};

export type MidtransChargeResponse = {
  status_code?: string;
  status_message?: string;
  transaction_id?: string;
  order_id?: string;
  merchant_id?: string;
  gross_amount?: string;
  currency?: string;
  payment_type?: string;
  transaction_time?: string;
  transaction_status?: string;
  fraud_status?: string;
  expiry_time?: string;
  // Beberapa respons Midtrans memakai nama field expired_time.
  expired_time?: string;
  va_numbers?: Array<{ bank?: string; va_number?: string }>;
  permata_va_number?: string;
  bill_key?: string;
  biller_code?: string;
  qr_string?: string;
  actions?: Array<{ name?: string; method?: string; url?: string }>;
};

export type MidtransStatusResponse = {
  status_code?: string;
  status_message?: string;
  transaction_id?: string;
  order_id?: string;
  transaction_status?: string;
  fraud_status?: string;
  gross_amount?: string;
  payment_type?: string;
  transaction_time?: string;
  settlement_time?: string;
  expiry_time?: string;
  refund_amount?: string;
  refunds?: Array<Record<string, unknown>>;
};

// Setiap pemanggilan API mengembalikan bentuk konsisten:
// { success: true, data } atau { success: false, code, message_id, message_debug }.
// message_id = pesan ramah bahasa Indonesia untuk pelanggan.
// message_debug = detail teknis untuk log server (tanpa kredensial).
export type MidtransError = {
  success: false;
  code: string;
  message_id: string;
  message_debug: string;
  httpStatus: number | null;
  statusCode: number | null;
};

export type MidtransResult<T> = { success: true; data: T } | MidtransError;

// =========================================================
// Pemetaan error → pesan ramah pelanggan (message_id)
// =========================================================

type FriendlyError = { code: string; message_id: string };

const FRIENDLY: Record<string, FriendlyError> = {
  TIMEOUT: { code: "TIMEOUT", message_id: "Penyedia pembayaran tidak merespons dalam waktu yang ditentukan. Silakan coba lagi." },
  UNREACHABLE: { code: "UNREACHABLE", message_id: "Tidak dapat terhubung ke penyedia pembayaran. Periksa koneksi lalu coba lagi." },
  NOT_CONFIGURED: { code: "NOT_CONFIGURED", message_id: "Konfigurasi pembayaran belum lengkap. Hubungi admin." },
  VALIDATION: { code: "VALIDATION", message_id: "Data transaksi tidak valid. Periksa kembali nominal dan metode pembayaran." },
  AUTH_INVALID: { code: "AUTH_INVALID", message_id: "Kunci pembayaran tidak valid." },
  CHANNEL_NOT_ACTIVATED: { code: "CHANNEL_NOT_ACTIVATED", message_id: "Metode pembayaran ini sedang tidak tersedia, silakan pilih metode lain." },
  NOT_FOUND: { code: "NOT_FOUND", message_id: "Transaksi tidak ditemukan di penyedia pembayaran." },
  DUPLICATE_ORDER: { code: "DUPLICATE_ORDER", message_id: "Transaksi duplikat, coba lagi." },
  TRANSACTION_EXPIRED: { code: "TRANSACTION_EXPIRED", message_id: "Transaksi sudah kedaluwarsa." },
  ACCOUNT_BLOCKED: { code: "ACCOUNT_BLOCKED", message_id: "Pembayaran ditolak penyedia. Silakan coba metode lain." },
  RATE_LIMITED: { code: "RATE_LIMITED", message_id: "Terlalu banyak permintaan. Mohon tunggu sebentar lalu coba lagi." },
  DENIED: { code: "DENIED", message_id: "Pembayaran ditolak oleh penyedia pembayaran." },
  INVALID_RESPONSE: { code: "INVALID_RESPONSE", message_id: "Respons penyedia pembayaran tidak dikenal. Silakan coba lagi." },
  REJECTED: { code: "REJECTED", message_id: "Permintaan pembayaran ditolak, coba metode lain." },
};

// Pemetaan status_code Midtrans (body) → kunci pesan ramah. Sumber: dokumentasi
// resmi "Code 2xx" dan "Code 4xx" Midtrans.
const STATUS_CODE_KEY: Record<number, string> = {
  400: "VALIDATION",
  401: "AUTH_INVALID",
  402: "CHANNEL_NOT_ACTIVATED",
  404: "NOT_FOUND",
  406: "DUPLICATE_ORDER",
  407: "TRANSACTION_EXPIRED",
  410: "ACCOUNT_BLOCKED",
  429: "RATE_LIMITED",
};

function friendlyError(key: string): FriendlyError {
  return FRIENDLY[key] || FRIENDLY.REJECTED;
}

function buildError(
  key: string,
  debug: string,
  detail: { httpStatus?: number | null; statusCode?: number | null } = {}
): MidtransError {
  const friendly = friendlyError(key);
  return {
    success: false,
    code: friendly.code,
    message_id: friendly.message_id,
    message_debug: debug,
    httpStatus: detail.httpStatus ?? null,
    statusCode: detail.statusCode ?? null,
  };
}

// =========================================================
// HTTP inti
// =========================================================

// Server Key dipakai sebagai username Basic Auth dengan password kosong.
function basicAuth(cfg: MidtransConfig) {
  return `Basic ${Buffer.from(`${cfg.serverKey}:`).toString("base64")}`;
}

async function rawRequest(
  url: string,
  cfg: MidtransConfig,
  init: { method?: "GET" | "POST"; body?: unknown; accept?: string; idempotencyKey?: string } = {}
) {
  try {
    return await fetch(url, {
      method: init.method || "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: init.accept || "application/json",
        Authorization: basicAuth(cfg),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (error: any) {
    // Jangan pernah membocorkan URL/kredensial ke pesan error.
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    const err: MidtransError = buildError(
      timedOut ? "TIMEOUT" : "UNREACHABLE",
      timedOut ? "request timeout" : "network error",
    );
    throw Object.assign(new Error(err.code), err);
  }
}

type ParsedResponse = {
  httpStatus: number;
  json: any | null;
  bodyText: string;
};

async function parseResponse(res: Response): Promise<ParsedResponse> {
  const text = await res.text().catch(() => "");
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { httpStatus: res.status, json, bodyText: text };
}

// Rangkum detail teknis dari respons Midtrans untuk message_debug.
// Tidak memuat kredensial dan tidak memuat data pribadi pelanggan.
function debugSummary(context: string, parsed: ParsedResponse, extra?: string) {
  const json = parsed.json;
  const errorMessages = Array.isArray(json?.error_messages) && json.error_messages.length
    ? json.error_messages.join(", ")
    : "";
  const parts = [
    context,
    `http=${parsed.httpStatus}`,
    json?.status_code ? `status_code=${json.status_code}` : null,
    json?.status_message ? `status_message=${String(json.status_message).slice(0, 200)}` : null,
    errorMessages ? `error_messages=${errorMessages.slice(0, 200)}` : null,
    extra || null,
  ].filter(Boolean);
  return parts.join(" ");
}

// =========================================================
// createCharge — semua payment_type yang didukung
// =========================================================

export async function createCharge(request: MidtransChargeRequest): Promise<MidtransResult<MidtransChargeResponse>> {
  const cfg = readConfig();
  if (!cfg.serverKey) return buildError("NOT_CONFIGURED", "server key belum diset");

  const orderId = String(request.orderId || "").trim();
  const grossAmount = Math.round(Number(request.grossAmount));
  if (!orderId) return buildError("VALIDATION", "order_id kosong");
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return buildError("VALIDATION", "gross_amount tidak valid");

  const expiryMinutes = resolveExpiryMinutes(request.paymentType, request.expiryMinutes);
  const body: Record<string, unknown> = {
    payment_type: request.paymentType,
    transaction_details: { order_id: orderId, gross_amount: grossAmount },
    custom_expiry: { expiry_duration: expiryMinutes, unit: "minute" },
  };
  if (request.paymentType === "qris") {
    const acquirer = String(request.acquirer || process.env.MIDTRANS_QRIS_ACQUIRER || "").trim().toLowerCase();
    // Field qris bersifat opsional; kalau kosong Midtrans memakai acquirer default merchant.
    if (acquirer) body.qris = { acquirer };
  } else if (request.paymentType === "bank_transfer") {
    const bank = String(request.bank || "").trim().toLowerCase();
    if (!bank) return buildError("VALIDATION", "bank_transfer tanpa nama bank");
    body.bank_transfer = { bank };
  } else if (request.paymentType === "echannel") {
    // Mandiri membatasi bill_info1 maks 10 karakter dan bill_info2 maks 30 karakter.
    body.echannel = {
      bill_info1: String(request.billInfo1 || "Payment:").slice(0, 10),
      bill_info2: String(request.billInfo2 || "Aidil Store").slice(0, 30),
    };
  }

  if (request.itemDetails?.length) {
    const items = request.itemDetails
      .map((item) => ({
        id: String(item.id).slice(0, 50),
        name: String(item.name).slice(0, 50),
        price: Math.round(Number(item.price)),
        quantity: Math.max(1, Math.round(Number(item.quantity ?? 1))),
      }))
      .filter((item) => item.price > 0 && item.name);
    // Midtrans menolak charge kalau total item_details tidak sama dengan gross_amount.
    const itemsTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (itemsTotal !== grossAmount) return buildError("VALIDATION", "total item_details tidak sama dengan gross_amount");
    if (items.length) body.item_details = items;
  }

  // Idempotency-Key tidak didukung untuk Permata VA (dokumentasi Midtrans).
  const idempotencyKey = request.paymentType === "permata"
    ? undefined
    : normalizeIdempotencyKey(request.idempotencyKey);

  let parsed: ParsedResponse;
  try {
    const res = await rawRequest(`${cfg.baseUrl}/v2/charge`, cfg, { method: "POST", body, idempotencyKey });
    parsed = await parseResponse(res);
  } catch (error: any) {
    const err = error as MidtransError;
    if (err && err.success === false) return err;
    return buildError("UNREACHABLE", "charge gagal dijalankan");
  }

  const bodyStatusCode = Number(parsed.json?.status_code);
  const numericBodyCode = Number.isFinite(bodyStatusCode) ? bodyStatusCode : null;
  // status_code di body Midtrans adalah sumber kebenaran: charge bisa balas HTTP 200
  // tapi status_code 4xx (mis. 402 channel tidak aktif), dan 202 pada charge berarti
  // transaksi DENIED oleh penyedia/FDS.
  const chargeFailed =
    (!parsed.httpStatus || parsed.httpStatus < 200 || parsed.httpStatus >= 300) ||
    (numericBodyCode !== null && (numericBodyCode === 202 || numericBodyCode >= 400));

  if (chargeFailed) {
    const key = STATUS_CODE_KEY[numericBodyCode ?? -1] || (numericBodyCode === 202 ? "DENIED" : "REJECTED");
    return buildError(key, debugSummary(`charge ${request.paymentType}`, parsed), {
      httpStatus: parsed.httpStatus,
      statusCode: numericBodyCode,
    });
  }
  if (!parsed.json || !String(parsed.json?.transaction_id || "").trim()) {
    return buildError("INVALID_RESPONSE", debugSummary("charge tanpa transaction_id", parsed));
  }
  return { success: true, data: parsed.json as MidtransChargeResponse };
}

function normalizeIdempotencyKey(value?: string) {
  const key = String(value || "").trim();
  // Batas resmi Midtrans: maks 46 karakter — nilai lebih panjang diabaikan Midtrans.
  if (!key || key.length > 46) return undefined;
  return key;
}

// =========================================================
// getTransactionStatus — cek status manual (rekonsiliasi)
// =========================================================

export async function getTransactionStatus(id: string): Promise<MidtransResult<MidtransStatusResponse>> {
  const cfg = readConfig();
  if (!cfg.serverKey) return buildError("NOT_CONFIGURED", "server key belum diset");

  const txnId = String(id || "").trim();
  if (!txnId) return buildError("VALIDATION", "id transaksi kosong");

  let parsed: ParsedResponse;
  try {
    const res = await rawRequest(`${cfg.baseUrl}/v2/${encodeURIComponent(txnId)}/status`, cfg, { method: "GET" });
    parsed = await parseResponse(res);
  } catch (error: any) {
    const err = error as MidtransError;
    if (err && err.success === false) return err;
    return buildError("UNREACHABLE", "status gagal dijalankan");
  }

  const bodyStatusCode = Number(parsed.json?.status_code);
  const numericBodyCode = Number.isFinite(bodyStatusCode) ? bodyStatusCode : null;
  // 404 = transaksi tidak ditemukan di Midtrans (salah id / belum pernah dibuat).
  // 407/410 dipertahankan sebagai data (perilaku lama Get Status) lalu dinormalisasi
  // statusnya di mapMidtransStatus.
  const failed = parsed.httpStatus === 404 || (numericBodyCode !== null && numericBodyCode >= 400 && ![407, 410].includes(numericBodyCode));
  if (failed) {
    const key = STATUS_CODE_KEY[numericBodyCode ?? parsed.httpStatus] || "REJECTED";
    return buildError(key, debugSummary("status", parsed), {
      httpStatus: parsed.httpStatus,
      statusCode: numericBodyCode,
    });
  }
  if (!parsed.json) {
    return buildError("INVALID_RESPONSE", debugSummary("status bukan JSON valid", parsed));
  }
  return { success: true, data: parsed.json as MidtransStatusResponse };
}

// =========================================================
// verifySignature — rumus resmi Midtrans
// =========================================================

// Verifikasi signature_key notifikasi Midtrans:
// SHA512(order_id + status_code + gross_amount + ServerKey) — nilai digabung apa adanya.
// Gunakan timingSafeEqual supaya perbandingan tidak bisa di-time.
export function verifySignature(input: {
  orderId: string;
  statusCode: string | number;
  grossAmount: string | number;
  signatureKey: string;
}): boolean {
  const cfg = readConfig();
  if (!cfg.serverKey) return false;
  const orderId = input.orderId == null ? "" : String(input.orderId);
  const statusCode = input.statusCode == null ? "" : String(input.statusCode);
  const grossAmount = input.grossAmount == null ? "" : String(input.grossAmount);
  const provided = String(input.signatureKey || "").trim().toLowerCase();
  if (!orderId || !statusCode || !grossAmount || !provided) return false;

  const expected = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${cfg.serverKey}`)
    .digest("hex")
    .toLowerCase();

  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// =========================================================
// Lapisan kompatibilitas — dipakai route yang ada sampai route
// dimigrasikan ke API baru (createCharge/getTransactionStatus).
// =========================================================

// Bentuk dinormalisasi supaya route & komponen tampilan yang sudah ada tidak
// perlu dirombak: field-nya sama dengan modul gateway sebelumnya.
export type GatewayTransaction = {
  txn_id: string;
  order_id: string;
  amount: number;
  fee?: number;
  total_payment?: number;
  payment_method: GatewayMethod;
  payment_number?: string;
  qr_string?: string;
  expired_at: string; // ISO 8601
  status: "pending" | "completed" | "canceled" | string;
  completed_at?: string | null;
};

export type GatewayTransactionStatus = {
  txn_id: string;
  order_id?: string;
  amount: number;
  status: "pending" | "completed" | "canceled" | string;
  completed_at?: string | null;
};

// Error terstruktur lama — dipertahankan karena route (mis. /api/topup) memeriksa
// kind & statusCode untuk memilih pesan ramah. Dibangun dari MidtransError baru.
export class GatewayError extends Error {
  kind: "TIMEOUT" | "UNREACHABLE" | "HTTP";
  httpStatus: number | null;
  statusCode: number | null;
  statusMessage: string | null;
  constructor(
    kind: GatewayError["kind"],
    detail: { httpStatus?: number | null; statusCode?: number | string | null; statusMessage?: string | null } = {}
  ) {
    super(kind === "TIMEOUT" ? "GATEWAY_TIMEOUT" : kind === "UNREACHABLE" ? "GATEWAY_UNREACHABLE" : `GATEWAY_HTTP_${detail.httpStatus ?? "?"}`);
    this.name = "GatewayError";
    this.kind = kind;
    this.httpStatus = detail.httpStatus ?? null;
    const code = Number(detail.statusCode);
    this.statusCode = Number.isFinite(code) ? code : null;
    this.statusMessage = detail.statusMessage ? String(detail.statusMessage) : null;
  }
}

function bridgeError(error: MidtransError): GatewayError {
  if (error.code === "TIMEOUT") return new GatewayError("TIMEOUT");
  if (error.code === "UNREACHABLE") return new GatewayError("UNREACHABLE");
  return new GatewayError("HTTP", {
    httpStatus: error.httpStatus,
    statusCode: error.statusCode,
    statusMessage: error.message_debug,
  });
}

// Metode internal → struktur charge Midtrans. Permata memakai payment_type
// "permata" (bukan bank_transfer) sesuai dokumentasi resmi.
const METHOD_CHARGE: Record<GatewayMethod, { paymentType: MidtransPaymentType; bank?: string }> = {
  qris: { paymentType: "qris" },
  bca_va: { paymentType: "bank_transfer", bank: "bca" },
  bni_va: { paymentType: "bank_transfer", bank: "bni" },
  bri_va: { paymentType: "bank_transfer", bank: "bri" },
  permata_va: { paymentType: "permata" },
};

// Timestamp Midtrans berbentuk "YYYY-MM-DD HH:mm:ss" dalam GMT+7.
function parseMidtransTime(value: unknown): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withZone = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw.replace(" ", "T")}+07:00` : raw;
  const date = new Date(withZone);
  return Number.isFinite(date.getTime()) ? date : null;
}

function resolveExpiryMinutes(paymentType: string, requested?: number) {
  const fallback = Number(process.env.MIDTRANS_EXPIRY_MINUTES);
  const base = Number.isFinite(fallback) && fallback > 0
    ? Math.round(fallback)
    : paymentType === "qris"
      ? DEFAULT_EXPIRY_MINUTES
      : DEFAULT_VA_EXPIRY_MINUTES;
  const wanted = Number(requested);
  if (!Number.isFinite(wanted) || wanted <= 0) return Math.min(1440, Math.max(1, base));
  return Math.min(1440, Math.max(1, Math.round(wanted)));
}

// Normalisasi transaction_status Midtrans ke status internal.
function mapMidtransStatus(
  transactionStatus: unknown,
  fraudStatus?: unknown,
  bodyStatusCode?: unknown
): GatewayTransaction["status"] {
  if (String(fraudStatus || "").toLowerCase() === "deny") return "failed";
  const raw = String(transactionStatus || "").toLowerCase();
  if (raw) {
    switch (raw) {
      case "settlement":
      case "capture":
        return "completed";
      case "deny":
        return "failed";
      case "expire":
        return "expired";
      case "cancel":
        return "canceled";
      case "refund":
        return "refunded";
      case "partial_refund":
        return "partially_refunded";
      case "pending":
      case "authorize":
        return "pending";
      default:
        return "pending";
    }
  }
  // Body tanpa transaction_status (mis. respons 407/410 lama Get Status).
  const code = Number(bodyStatusCode);
  if (code === 407) return "expired";
  if (code === 410) return "failed";
  return "pending";
}

function extractVaNumber(data: any): string {
  const list = Array.isArray(data?.va_numbers) ? data.va_numbers : [];
  const fromList = list.map((v: any) => String(v?.va_number || "").trim()).find(Boolean);
  return fromList || String(data?.permata_va_number || "").trim();
}

async function fetchQrImage(cfg: MidtransConfig, data: any): Promise<string> {
  const actions = Array.isArray(data?.actions) ? data.actions : [];
  const pick =
    actions.find((a: any) => a?.name === "generate-qr-code") ||
    actions.find((a: any) => String(a?.name || "").startsWith("generate-qr-code"));
  const url = String(pick?.url || "").trim();
  if (!url) throw new Error("GATEWAY_QR_UNAVAILABLE");
  const res = await rawRequest(url, cfg, { accept: "image/png,image/*;q=0.9,application/json;q=0.8" });
  if (!res.ok) throw new GatewayError("HTTP", { httpStatus: res.status, statusCode: res.status, statusMessage: "Gambar QR Midtrans tidak tersedia" });
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("json")) {
    const json: any = await res.json().catch(() => null);
    const qrString = String(json?.qr_string || json?.data?.qr_string || "").trim();
    if (!qrString) throw new Error("GATEWAY_QR_UNAVAILABLE");
    return QRCode.toDataURL(qrString, { margin: 1, width: QR_RENDER_WIDTH });
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error("GATEWAY_QR_UNAVAILABLE");
  if (bytes.length > MAX_QR_IMAGE_BYTES) throw new Error("GATEWAY_QR_TOO_LARGE");
  const mime = contentType.startsWith("image/") ? contentType.split(";")[0].trim() : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

export type GatewayItemDetail = { id: string; name: string; price: number };

export type CreateGatewayTransactionOptions = {
  // Dipakai untuk custom_expiry Midtrans supaya kedaluwarsa di gateway sama
  // dengan batas pembayaran internal (mis. deadline_minutes Top Up).
  expiryMinutes?: number;
  // Rincian item Midtrans: jumlah harga semua item WAJIB persis sama dengan
  // gross_amount (Midtrans menolak charge kalau tidak cocok). Baris harga 0
  // dibuang otomatis.
  itemDetails?: GatewayItemDetail[];
};

export async function createGatewayTransaction(
  orderId: string,
  amount: number,
  method: GatewayMethod = "qris",
  options: CreateGatewayTransactionOptions = {}
): Promise<GatewayTransaction> {
  const cfg = readConfig();
  if (!cfg.serverKey) throw new Error("GATEWAY_NOT_CONFIGURED");
  if (!isGatewayMethod(method)) throw new Error("GATEWAY_METHOD_NOT_SUPPORTED");

  const charge = METHOD_CHARGE[method];
  // Midtrans menolak charge kalau jumlah item_details tidak sama dengan gross_amount;
  // tolak lebih awal dengan penanda yang dikenal pemanggil lama.
  if (options.itemDetails?.length) {
    const itemsTotal = options.itemDetails
      .filter((item) => item.price > 0 && item.name)
      .reduce((sum, item) => sum + Math.round(item.price), 0);
    if (itemsTotal !== Math.round(amount)) throw new Error("GATEWAY_ITEM_TOTAL_MISMATCH");
  }
  const result = await createCharge({
    orderId,
    grossAmount: amount,
    paymentType: charge.paymentType,
    bank: charge.bank as MidtransChargeRequest["bank"],
    expiryMinutes: options.expiryMinutes,
    itemDetails: options.itemDetails,
  });
  if (!result.success) throw bridgeError(result);

  const data = result.data;
  const txnId = String(data?.transaction_id || "").trim();
  if (!txnId) throw new Error("GATEWAY_INVALID_RESPONSE");

  const grossAmount = Math.round(Number(amount));
  const qrString = String(data?.qr_string || "").trim();
  const transactionTime = parseMidtransTime(data?.transaction_time);
  const expiredAt =
    parseMidtransTime(data?.expiry_time) ||
    parseMidtransTime(data?.expired_time) ||
    new Date((transactionTime || new Date()).getTime() + resolveExpiryMinutes(charge.paymentType, options.expiryMinutes) * 60 * 1000);

  const paymentNumber = method === "qris" ? qrString || (await fetchQrImage(cfg, data)) : extractVaNumber(data);
  if (!paymentNumber) throw new Error(method === "qris" ? "GATEWAY_QR_UNAVAILABLE" : "GATEWAY_INVALID_RESPONSE");

  return {
    txn_id: txnId,
    order_id: String(data?.order_id || orderId),
    // Respons charge Midtrans tidak memuat biaya MDR, jadi fee dinormalkan 0.
    // Nominal yang ditagih ke pelanggan tetap dihitung oleh sistem biaya internal.
    amount: Number(data?.gross_amount ?? grossAmount),
    fee: 0,
    total_payment: Number(data?.gross_amount ?? grossAmount),
    payment_method: method,
    payment_number: paymentNumber,
    qr_string: qrString || undefined,
    expired_at: expiredAt.toISOString(),
    status: mapMidtransStatus(data?.transaction_status, data?.fraud_status),
    completed_at: null,
  };
}

// Cross-check status langsung ke Midtrans. Endpoint ini menerima order_id maupun
// transaction_id; kita selalu menyimpan transaction_id di gateway_txn_id /
// provider_txn_id (wajib untuk BI SNAP & DANA).
export async function getGatewayTransactionDetail(txnId: string): Promise<GatewayTransactionStatus> {
  const result = await getTransactionStatus(txnId);
  if (!result.success) throw bridgeError(result);
  const data = result.data;
  const status = mapMidtransStatus(data?.transaction_status, data?.fraud_status, data?.status_code);
  const completedAt =
    parseMidtransTime(data?.settlement_time) ||
    parseMidtransTime(data?.transaction_time) ||
    new Date();
  return {
    txn_id: String(data?.transaction_id || txnId),
    order_id: data?.order_id ? String(data.order_id) : undefined,
    amount: Number(data?.gross_amount ?? 0),
    status,
    completed_at: status === "completed" ? completedAt.toISOString() : null,
  };
}

// Verifikasi signature_key notifikasi Midtrans dari raw body.
// `signatureHeader` opsional — Midtrans mengirim signature_key di dalam body.
export function verifyGatewayWebhookSignature(rawBody: string, signatureHeader?: string | null): boolean {
  let payload: any = null;
  try { payload = JSON.parse(rawBody || "null"); } catch { return false; }
  if (!payload || typeof payload !== "object") return false;
  return verifySignature({
    orderId: payload.order_id,
    statusCode: payload.status_code,
    grossAmount: payload.gross_amount,
    signatureKey: String(signatureHeader || payload.signature_key || ""),
  });
}

// Nomor/gambar yang dirender ke pelanggan: nomor VA untuk bank_transfer/permata,
// data URL gambar QR untuk QRIS. String QR mentah tetap didukung sebagai cadangan.
export function extractGatewayPaymentNumber(
  payment: Pick<GatewayTransaction, "payment_number" | "qr_string">
) {
  return payment.payment_number || payment.qr_string || "";
}

export function isGatewayFailedStatus(status: string | null | undefined) {
  return ["canceled", "cancelled", "expired", "failed"].includes(String(status || "").toLowerCase());
}
