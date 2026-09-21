// Helper untuk integrasi Pakasir (payment gateway QRIS/VA otomatis) — API v2.
// Dokumentasi resmi: https://pakasir.com/p/docs (Panduan v2)
//
// PENTING (v2): Pakasir SEKARANG mengirim header "X-Secret" pada webhook untuk
// verifikasi keaslian pengirim (lihat verifyPakasirWebhookSecret). Meskipun
// begitu, status pembayaran tetap dikonfirmasi ulang lewat Transaction Status
// API (getPakasirTransactionDetail) sebelum order/topup ditandai selesai,
// sebagai lapisan pertahanan kedua. Jangan pernah mempercayai body webhook
// begitu saja hanya karena header secret cocok.

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
  | "artha_graha_va"
  | "payment_link";

// Response POST /api/v2/create-transaction/{slug}/{order_id}
export type PakasirTransaction = {
  txn_id: string;
  project?: string;
  order_id?: string;
  amount: number;
  fee?: number;
  total_payment?: number;
  payment_method: string;
  qr_string?: string; // untuk method "qris"
  va_number?: string; // untuk method *_va
  payment_link?: string; // untuk method "payment_link"
  expired_at: string;
  is_sandbox?: boolean;
  status: "pending" | "completed" | "canceled" | string;
  completed_at?: string | null;
};

// Response GET /api/v2/transaction-status/{slug}/{txn_id}
export type PakasirTransactionStatus = {
  txn_id: string;
  order_id: string;
  amount: number;
  is_sandbox: boolean;
  status: "pending" | "completed" | "canceled" | string;
  completed_at?: string | null;
};

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { apiKey } = requireEnv();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message || `PAKASIR_ERROR_${res.status}`);
  }
  return json as T;
}

// Membuat transaksi baru di Pakasir (v2). order_id HARUS unik per project.
// Kita pakai order_number internal (mis. TOPUP-20260921-abcdef) sebagai order_id.
export async function createPakasirTransaction(
  orderId: string,
  amount: number,
  method: PakasirMethod = "qris"
) {
  const { project } = requireEnv();
  return apiRequest<PakasirTransaction>(
    `/api/v2/create-transaction/${project}/${encodeURIComponent(orderId)}`,
    {
      method: "POST",
      body: JSON.stringify({ method, amount }),
    }
  );
}

// Cross-check status langsung ke Pakasir memakai txn_id (hasil dari createPakasirTransaction).
// Nama fungsi dipertahankan (getPakasirTransactionDetail) untuk kompatibilitas
// pemanggil lama, walau sekarang parameternya txn_id, bukan order_id+amount.
export async function getPakasirTransactionDetail(txnId: string) {
  const { project } = requireEnv();
  return apiRequest<PakasirTransactionStatus>(
    `/api/v2/transaction-status/${project}/${encodeURIComponent(txnId)}`,
    { method: "GET" }
  );
}

// Verifikasi header X-Secret yang dikirim Pakasir pada webhook.
// Selalu gunakan bersamaan dengan getPakasirTransactionDetail (defense in depth) —
// jangan proses webhook hanya berdasarkan header ini saja.
export function verifyPakasirWebhookSecret(headerValue: string | null) {
  const secret = process.env.PAKASIR_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!headerValue) return false;
  return headerValue === secret;
}

export function isPakasirConfigured() {
  return Boolean(process.env.PAKASIR_PROJECT && process.env.PAKASIR_API_KEY);
}

// CATATAN: endpoint cancel/simulation tidak lagi didokumentasikan di API v2.
// Jika kode kamu punya route /api/topup/[id]/cancel yang memanggil
// cancelPakasirTransaction dari versi lama, route tersebut perlu diperiksa —
// kemungkinan cukup mengubah status di database internal saja (transaksi di
// Pakasir akan otomatis "canceled" setelah 1x24 jam sesuai dokumentasi Status
// Transaksi), tanpa perlu memanggil API Pakasir untuk membatalkan.