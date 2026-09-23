// Helper untuk integrasi FR3 NEWERA (payment gateway QRIS) — menggantikan Pakasir.
// Dokumentasi resmi: https://fr3newera.com/docs (Baca Dokumentasi di landing page)
//
// CATATAN PENTING:
// 1. FR3 NEWERA saat ini hanya menyediakan metode QRIS (tidak ada Virtual Account
//    seperti Pakasir). Kalau ada kode pemanggil yang minta method selain "qris",
//    fungsi di bawah akan menolak dengan error GATEWAY_METHOD_NOT_SUPPORTED.
// 2. Endpoint POST /api/v1/topup di FR3 NEWERA TIDAK menerima order_id — setiap
//    topup mendapat trxId sendiri dari FR3. Karena itu pencocokan order/topup
//    internal kita sekarang dilakukan lewat trxId (gateway_txn_id / provider_txn_id),
//    bukan lewat order_id seperti alur Pakasir lama. Parameter `orderId` pada
//    createGatewayTransaction() sengaja dipertahankan di signature (tidak dipakai
//    ke FR3) supaya route yang memanggilnya tidak perlu diubah strukturnya.
// 3. Header/format signature webhook FR3 NEWERA belum terkonfirmasi persis dari
//    dokumentasi publik mereka (halaman "Verifikasi Signature" terpisah dari yang
//    sempat dibagikan). verifyGatewayWebhookSignature() di bawah memakai skema
//    HMAC-SHA256 generik sebagai lapisan pertama; verifikasi keaslian yang
//    SESUNGGUHNYA tetap dilakukan lewat getGatewayTransactionDetail() (re-check
//    langsung ke FR3 NEWERA pakai trxId) sebelum order/topup ditandai selesai.
//    Sesuaikan verifyGatewayWebhookSignature() begitu kamu punya detail resmi
//    dari dashboard FR3 NEWERA (menu Webhooks > Verifikasi Signature).

import crypto from "node:crypto";
import https from "node:https";
import { HttpsProxyAgent } from "https-proxy-agent";

const BASE_URL = "https://fr3newera.com/api/v1";

function requireEnv() {
  const apiKey = process.env.FR3NEWERA_API_KEY;
  if (!apiKey) {
    throw new Error("GATEWAY_NOT_CONFIGURED");
  }
  return { apiKey };
}

export type GatewayMethod = "qris";

// Bentuk dinormalisasi supaya kompatibel dengan kode lama yang tadinya menunggu
// bentuk respons Pakasir (txn_id, total_payment, qr_string, expired_at, status).
export type GatewayTransaction = {
  txn_id: string;
  amount: number;
  fee?: number;
  total_payment?: number;
  payment_method: "qris";
  qr_string?: string;
  expired_at: string; // ISO 8601
  status: "pending" | "completed" | "canceled" | string;
  completed_at?: string | null;
};

export type GatewayTransactionStatus = {
  txn_id: string;
  amount: number;
  status: "pending" | "completed" | "canceled" | string;
  completed_at?: string | null;
};

// FR3 NEWERA memakai IP Whitelist. Kalau FR3NEWERA_PROXY_URL (atau DIGIFLAZZ_PROXY_URL)
// diisi, semua request ke FR3 dikirim lewat proxy ber-IP tetap itu, jadi cukup
// daftarkan IP proxy tersebut di dashboard FR3 NEWERA > IP Whitelist.
function getProxyAgent() {
  const proxyUrl = process.env.FR3NEWERA_PROXY_URL || process.env.DIGIFLAZZ_PROXY_URL;
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
}

async function apiRequest<T>(path: string, init: RequestInit & { body?: string } = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  const { status, text } = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: (init.method || "GET").toUpperCase(),
        headers: { "Content-Type": "application/json", ...((init.headers as Record<string, string>) || {}) },
        agent: getProxyAgent(),
        timeout: 20000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, text: data }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("GATEWAY_TIMEOUT")));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = null; }
  const ok = status >= 200 && status < 300;
  if (!ok || (json && typeof json.status === "number" && json.status >= 400)) {
    throw new Error(json?.error || json?.message || `GATEWAY_ERROR_${status}`);
  }
  return json as T;
}

function mapFr3Status(raw: string | undefined | null): GatewayTransaction["status"] {
  switch (String(raw || "").toUpperCase()) {
    case "SUCCESS":
      return "completed";
    case "EXPIRED":
    case "CANCELED":
    case "CANCELLED":
      return "canceled";
    default:
      return "pending";
  }
}

// Membuat transaksi topup baru (QRIS) di FR3 NEWERA.
// `orderId` dipertahankan di signature untuk kompatibilitas pemanggil lama —
// TIDAK dikirim ke FR3 NEWERA karena endpoint mereka tidak menerima order_id.
export async function createGatewayTransaction(
  orderId: string,
  amount: number,
  method: GatewayMethod = "qris"
): Promise<GatewayTransaction> {
  if (method !== "qris") {
    throw new Error("GATEWAY_METHOD_NOT_SUPPORTED");
  }
  const { apiKey } = requireEnv();
  const json = await apiRequest<{ data: any }>("/topup", {
    method: "POST",
    body: JSON.stringify({ apikey: apiKey, nominal: amount, add_mdr_to_customer: false }),
  });
  const d = json.data;
  if (!d?.trxId || !d?.qr_string) {
    throw new Error("GATEWAY_INVALID_RESPONSE");
  }
  return {
    txn_id: d.trxId,
    amount: d.amount ?? amount,
    fee: d.mdr?.mdr_amount ?? d.fee ?? 0,
    total_payment: d.totalTransfer ?? d.amount ?? amount,
    payment_method: "qris",
    qr_string: d.qr_string,
    expired_at: new Date(Number(d.expiry)).toISOString(),
    status: "pending",
  };
}

// Cross-check status langsung ke FR3 NEWERA memakai trxId.
export async function getGatewayTransactionDetail(txnId: string): Promise<GatewayTransactionStatus> {
  const { apiKey } = requireEnv();
  const json = await apiRequest<{ data: any }>(
    `/check-status?apikey=${encodeURIComponent(apiKey)}&idTransaksi=${encodeURIComponent(txnId)}`,
    { method: "GET" }
  );
  const d = json.data;
  return {
    txn_id: d.trxId,
    amount: Number(d.amount),
    status: mapFr3Status(d.status),
    completed_at: mapFr3Status(d.status) === "completed" ? new Date().toISOString() : null,
  };
}

// Verifikasi signature webhook FR3 NEWERA. Skema HMAC-SHA256 generik sebagai
// lapisan pertama — TIDAK dijadikan satu-satunya sumber kebenaran; status akhir
// selalu dikonfirmasi ulang lewat getGatewayTransactionDetail().
export function verifyGatewayWebhookSignature(rawBody: string, signatureHeader: string | null) {
  const secret = process.env.FR3NEWERA_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export function extractGatewayPaymentNumber(
  payment: Pick<GatewayTransaction, "payment_method" | "qr_string">
) {
  return payment.qr_string || "";
}

export function isGatewayFailedStatus(status: string | null | undefined) {
  return ["canceled", "cancelled", "expired", "failed"].includes(String(status || "").toLowerCase());
}

export function isGatewayConfigured() {
  return Boolean(process.env.FR3NEWERA_API_KEY);
}

// Mengecek saldo akun FR3 NEWERA (dipakai halaman admin, opsional).
export async function getGatewaySaldo(): Promise<number> {
  const { apiKey } = requireEnv();
  const json = await apiRequest<{ data: { saldo: number } }>(
    `/check-saldo?apikey=${encodeURIComponent(apiKey)}`,
    { method: "GET" }
  );
  return json.data.saldo;
}