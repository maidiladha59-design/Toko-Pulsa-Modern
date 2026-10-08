// Integrasi Midtrans Core API (v2) — menggantikan FR3 NEWERA.
// Dokumentasi resmi: https://docs.midtrans.com/reference/core-api
//
// CATATAN PENTING:
// 1. Core API dipakai (BUKAN Snap), jadi instruksi pembayaran tetap dirender di
//    dalam aplikasi: QRIS berupa gambar QR, Virtual Account berupa nomor VA.
// 2. Midtrans TIDAK mengembalikan qr_string pada respons charge QRIS. Yang
//    dikembalikan adalah actions[].url (generate-qr-code) berupa gambar PNG yang
//    hanya bisa diakses dengan Basic Auth Server Key. Karena <img> di browser
//    tidak bisa mengirim Basic Auth, gambar itu diunduh di sisi server lalu
//    disimpan sebagai data URL base64 supaya bisa langsung dirender klien.
// 3. GoPay sengaja TIDAK diintegrasikan: Core API GoPay hanya mengembalikan
//    deeplink ke aplikasi Gojek, tidak ada nomor/QR yang bisa dirender di dalam
//    halaman ini tanpa melempar pengguna keluar aplikasi.
// 4. Kredensial HANYA dibaca dari environment variable. Tidak ada nilai yang
//    di-hardcode dan tidak ada default untuk Server Key.
// 5. Signature webhook Midtrans = SHA512(order_id + status_code + gross_amount + ServerKey).
//    Payload webhook TIDAK boleh dipercaya sebelum signature ini cocok.

import crypto from "node:crypto";
import QRCode from "qrcode";

const REQUEST_TIMEOUT_MS = 20000;
const QR_RENDER_WIDTH = 360;
// Batas aman supaya kolom payment_number/qris_payload (text) tidak membengkak.
const MAX_QR_IMAGE_BYTES = 200 * 1024;
const DEFAULT_EXPIRY_MINUTES = 60;
// Default kedaluwarsa Virtual Account Midtrans adalah 24 jam.
const DEFAULT_VA_EXPIRY_MINUTES = 1440;

export const GATEWAY_PROVIDER = "midtrans";

export const GATEWAY_METHODS = ["qris", "bca_va", "bni_va", "bri_va", "permata_va"] as const;

export type GatewayMethod = (typeof GATEWAY_METHODS)[number];

// payment_type Midtrans "bank_transfer" hanya menerima 4 bank ini.
const VA_BANK: Record<Exclude<GatewayMethod, "qris">, "bca" | "bni" | "bri" | "permata"> = {
  bca_va: "bca",
  bni_va: "bni",
  bri_va: "bri",
  permata_va: "permata",
};

export function isGatewayMethod(value: unknown): value is GatewayMethod {
  return (GATEWAY_METHODS as readonly string[]).includes(String(value ?? ""));
}

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

export function getGatewayClientKey() {
  return readConfig().clientKey;
}

function requireConfig(): MidtransConfig {
  const cfg = readConfig();
  if (!cfg.serverKey) throw new Error("GATEWAY_NOT_CONFIGURED");
  return cfg;
}

// Server Key dipakai sebagai username Basic Auth dengan password kosong.
function basicAuth(cfg: MidtransConfig) {
  return `Basic ${Buffer.from(`${cfg.serverKey}:`).toString("base64")}`;
}

async function rawRequest(
  url: string,
  cfg: MidtransConfig,
  init: { method?: "GET" | "POST"; body?: unknown; accept?: string } = {}
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
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (error: any) {
    // Jangan pernah membocorkan URL/kredensial ke pesan error.
    throw new Error(error?.name === "TimeoutError" ? "GATEWAY_TIMEOUT" : "GATEWAY_UNREACHABLE");
  }
}

type JsonRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  // Kode HTTP yang tetap diperlakukan sebagai data, bukan error. Get Status API
  // Midtrans memakai 407 (expire) dan 410 (cancel) untuk status yang sah.
  toleratedStatus?: number[];
};

async function apiRequest<T>(path: string, opts: JsonRequestOptions = {}): Promise<T> {
  const cfg = requireConfig();
  const res = await rawRequest(`${cfg.baseUrl}${path}`, cfg, { method: opts.method, body: opts.body });
  const text = await res.text().catch(() => "");
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  const tolerated = opts.toleratedStatus || [];
  const bodyStatusCode = Number(json?.status_code);
  const toleratedBody = Number.isFinite(bodyStatusCode) && tolerated.includes(bodyStatusCode);
  if (!res.ok && !tolerated.includes(res.status) && !toleratedBody) {
    const message =
      Array.isArray(json?.error_messages) && json.error_messages.length
        ? json.error_messages.join(", ")
        : json?.status_message || `GATEWAY_ERROR_${res.status}`;
    throw new Error(String(message));
  }
  if (!json) throw new Error("GATEWAY_INVALID_RESPONSE");
  return json as T;
}

// Timestamp Midtrans berbentuk "YYYY-MM-DD HH:mm:ss" dalam GMT+7.
function parseMidtransTime(value: unknown): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withZone = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw.replace(" ", "T")}+07:00` : raw;
  const date = new Date(withZone);
  return Number.isFinite(date.getTime()) ? date : null;
}

function resolveExpiryMinutes(method: GatewayMethod, requested?: number) {
  const fallback = Number(process.env.MIDTRANS_EXPIRY_MINUTES);
  const base = Number.isFinite(fallback) && fallback > 0
    ? Math.round(fallback)
    : method === "qris"
      ? DEFAULT_EXPIRY_MINUTES
      : DEFAULT_VA_EXPIRY_MINUTES;
  const wanted = Number(requested);
  if (!Number.isFinite(wanted) || wanted <= 0) return Math.min(1440, Math.max(1, base));
  return Math.min(1440, Math.max(1, Math.round(wanted)));
}

// Normalisasi transaction_status Midtrans ke status internal.
function mapMidtransStatus(
  transactionStatus: unknown,
  fraudStatus?: unknown
): GatewayTransaction["status"] {
  if (String(fraudStatus || "").toLowerCase() === "deny") return "failed";
  switch (String(transactionStatus || "").toLowerCase()) {
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
    default:
      return "pending";
  }
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
  if (!res.ok) throw new Error("GATEWAY_QR_UNAVAILABLE");
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

export type CreateGatewayTransactionOptions = {
  // Dipakai untuk custom_expiry Midtrans supaya kedaluwarsa di gateway sama
  // dengan batas pembayaran internal (mis. deadline_minutes Top Up).
  expiryMinutes?: number;
};

export async function createGatewayTransaction(
  orderId: string,
  amount: number,
  method: GatewayMethod = "qris",
  options: CreateGatewayTransactionOptions = {}
): Promise<GatewayTransaction> {
  const cfg = requireConfig();
  if (!isGatewayMethod(method)) throw new Error("GATEWAY_METHOD_NOT_SUPPORTED");
  const grossAmount = Math.round(Number(amount));
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) throw new Error("GATEWAY_INVALID_AMOUNT");

  const expiryMinutes = resolveExpiryMinutes(method, options.expiryMinutes);
  const body: Record<string, unknown> = {
    payment_type: method === "qris" ? "qris" : "bank_transfer",
    transaction_details: { order_id: orderId, gross_amount: grossAmount },
    custom_expiry: { expiry_duration: expiryMinutes, unit: "minute" },
  };
  if (method === "qris") {
    const acquirer = String(process.env.MIDTRANS_QRIS_ACQUIRER || "").trim().toLowerCase();
    // Field qris bersifat opsional; kalau kosong Midtrans memakai acquirer default merchant.
    if (acquirer) body.qris = { acquirer };
  } else {
    body.bank_transfer = { bank: VA_BANK[method] };
  }

  const data: any = await apiRequest("/v2/charge", { method: "POST", body });
  const txnId = String(data?.transaction_id || "").trim();
  if (!txnId) throw new Error("GATEWAY_INVALID_RESPONSE");

  const qrString = String(data?.qr_string || "").trim();
  const transactionTime = parseMidtransTime(data?.transaction_time);
  const expiredAt =
    parseMidtransTime(data?.expiry_time) ||
    parseMidtransTime(data?.expired_time) ||
    new Date((transactionTime || new Date()).getTime() + expiryMinutes * 60 * 1000);

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
  const id = String(txnId || "").trim();
  if (!id) throw new Error("GATEWAY_INVALID_RESPONSE");
  const data: any = await apiRequest(`/v2/${encodeURIComponent(id)}/status`, {
    toleratedStatus: [407, 410],
  });
  const status = mapMidtransStatus(data?.transaction_status, data?.fraud_status);
  const completedAt =
    parseMidtransTime(data?.settlement_time) ||
    parseMidtransTime(data?.transaction_time) ||
    new Date();
  return {
    txn_id: String(data?.transaction_id || id),
    order_id: data?.order_id ? String(data.order_id) : undefined,
    amount: Number(data?.gross_amount ?? 0),
    status,
    completed_at: status === "completed" ? completedAt.toISOString() : null,
  };
}

// Verifikasi signature_key notifikasi Midtrans:
// SHA512(order_id + status_code + gross_amount + ServerKey).
// `signatureHeader` opsional — Midtrans mengirim signature_key di dalam body.
export function verifyGatewayWebhookSignature(rawBody: string, signatureHeader?: string | null): boolean {
  const cfg = readConfig();
  if (!cfg.serverKey) return false;
  let payload: any = null;
  try { payload = JSON.parse(rawBody || "null"); } catch { return false; }
  if (!payload || typeof payload !== "object") return false;

  const orderId = payload.order_id == null ? "" : String(payload.order_id);
  const statusCode = payload.status_code == null ? "" : String(payload.status_code);
  const grossAmount = payload.gross_amount == null ? "" : String(payload.gross_amount);
  const provided = String(signatureHeader || payload.signature_key || "").trim().toLowerCase();
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

// Nomor/gambar yang dirender ke pelanggan: nomor VA untuk bank_transfer,
// data URL gambar QR untuk QRIS. String QR mentah tetap didukung sebagai cadangan.
export function extractGatewayPaymentNumber(
  payment: Pick<GatewayTransaction, "payment_number" | "qr_string">
) {
  return payment.payment_number || payment.qr_string || "";
}

export function isGatewayFailedStatus(status: string | null | undefined) {
  return ["canceled", "cancelled", "expired", "failed"].includes(String(status || "").toLowerCase());
}
