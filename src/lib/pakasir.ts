// Helper untuk integrasi Pakasir (payment gateway QRIS otomatis).
// Dokumentasi resmi: https://pakasir.com/p/docs
//
// PENTING: Pakasir tidak mengirim signature/HMAC pada webhook-nya, jadi
// status pembayaran SELALU dikonfirmasi ulang lewat Transaction Detail API
// (getTransactionDetail) sebelum order ditandai selesai. Jangan pernah
// mempercayai body webhook begitu saja.

const BASE_URL = "https://app.pakasir.com";

function requireEnv() {
  const project = process.env.PAKASIR_PROJECT;
  const apiKey = process.env.PAKASIR_API_KEY;
  if (!project || !apiKey) {
    throw new Error("PAKASIR_NOT_CONFIGURED");
  }
  return { project, apiKey };
}

export type PakasirMethod =
  | "qris"
  | "bni_va"
  | "bri_va"
  | "cimb_niaga_va"
  | "sampoerna_va"
  | "bnc_va"
  | "maybank_va"
  | "permata_va"
  | "atm_bersama_va"
  | "artha_graha_va"
  | "bri_va"
  | "bni_va";

export type PakasirPayment = {
  project: string;
  order_id: string;
  amount: number;
  fee: number;
  total_payment: number;
  payment_method: string;
  payment_number: string; // QR string (EMV) untuk QRIS, atau nomor VA untuk metode lain
  expired_at: string;
};

export type PakasirTransactionStatus = {
  amount: number;
  order_id: string;
  project: string;
  status: "pending" | "completed" | "expired" | "cancelled" | string;
  payment_method: string;
  completed_at?: string;
};

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message || `PAKASIR_ERROR_${res.status}`);
  }
  return json as T;
}

// Membuat transaksi baru di Pakasir. order_id HARUS unik per (project, order_id, amount).
// Kita pakai order_number internal (mis. INV-20260917-abcdef) sebagai order_id di Pakasir.
export async function createPakasirTransaction(orderId: string, amount: number, method: PakasirMethod = "qris") {
  const { project, apiKey } = requireEnv();
  const data = await postJson<{ payment: PakasirPayment }>(`/api/transactioncreate/${method}`, {
    project,
    order_id: orderId,
    amount,
    api_key: apiKey,
  });
  return data.payment;
}

// Cross-check status transaksi langsung ke Pakasir (lebih dipercaya daripada webhook saja).
export async function getPakasirTransactionDetail(orderId: string, amount: number) {
  const { project, apiKey } = requireEnv();
  const params = new URLSearchParams({ project, amount: String(amount), order_id: orderId, api_key: apiKey });
  const res = await fetch(`${BASE_URL}/api/transactiondetail?${params.toString()}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message || `PAKASIR_ERROR_${res.status}`);
  }
  return (json as { transaction: PakasirTransactionStatus }).transaction;
}

export async function cancelPakasirTransaction(orderId: string, amount: number) {
  const { project, apiKey } = requireEnv();
  return postJson(`/api/transactioncancel`, { project, order_id: orderId, amount, api_key: apiKey });
}

// Hanya berfungsi jika Proyek Pakasir masih dalam mode Sandbox.
export async function simulatePakasirPayment(orderId: string, amount: number) {
  const { project, apiKey } = requireEnv();
  return postJson(`/api/paymentsimulation`, { project, order_id: orderId, amount, api_key: apiKey });
}

export function isPakasirConfigured() {
  return Boolean(process.env.PAKASIR_PROJECT && process.env.PAKASIR_API_KEY);
}
