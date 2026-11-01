import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/settings";
import {
  DEFAULT_LEVEL_KYC_SETTINGS,
  LEVEL_KYC_SETTINGS_KEY,
  limitExceeded,
  limitsForStatus,
  type KycLimitStatus,
} from "@/lib/level-kyc-settings";
import { kycUiStatus } from "@/lib/labels";
import { formatRupiah } from "@/lib/utils";

// Penegakan batas KYC di server (migrasi v107).
//
// Nilai batas dibaca dari pengaturan terkelola lewat getSetting (cache +
// unstable_cache, tag settings:level_kyc_settings) sehingga tidak menambah
// query berat per request. UI hanya menampilkan; keputusan tetap di sini.
// File ini TIDAK menyentuh saldo/ledger: hanya menolak permintaan sebelum
// RPC checkout/transfer/topup dijalankan.

export type KycLimitKind = "topup" | "transfer" | "purchase";

export type KycCheckResult = { ok: true } | { ok: false; message: string; status: number };

const KIND_LABEL: Record<KycLimitKind, string> = {
  topup: "Top Up",
  transfer: "transfer",
  purchase: "pembelian",
};

const VERIFY_HINT = "Verifikasi akun untuk menaikkan batas.";

/** Awal hari menurut WIB (UTC+7), dikembalikan sebagai ISO UTC. */
export function wibDayStartIso(now = new Date()): string {
  const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const midnightUtc =
    Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()) - 7 * 60 * 60 * 1000;
  return new Date(midnightUtc).toISOString();
}

export async function kycLimitStatusForUser(userId: string): Promise<KycLimitStatus> {
  try {
    const { data, error } = await createAdminClient()
      .from("kyc_verifications")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return "unverified";
    const mapped = kycUiStatus(data?.status ?? null);
    return mapped === "verified" || mapped === "pending" ? mapped : "unverified";
  } catch {
    return "unverified";
  }
}

type DailyUsage = { topup: number; transfer: number; purchase: number };

async function loadDailyUsage(userId: string, dayStart: string): Promise<DailyUsage> {
  const admin = createAdminClient();
  const [topups, transfers, orders] = await Promise.all([
    admin
      .from("topups")
      .select("amount")
      .eq("user_id", userId)
      .eq("status", "APPROVED")
      .gte("created_at", dayStart),
    admin.from("wallet_transfers").select("amount").eq("sender_id", userId).gte("created_at", dayStart),
    admin
      .from("orders")
      .select("total_amount,status")
      .eq("user_id", userId)
      .gte("created_at", dayStart),
  ]);

  const sum = (rows: Array<Record<string, unknown>> | null, column: string, skip?: Set<string>) =>
    (rows || []).reduce((total, row) => {
      if (skip && skip.has(String(row.status || ""))) return total;
      return total + Number(row[column] || 0);
    }, 0);

  if (topups.error) console.error("KYC LIMIT TOPUP SUM ERROR:", topups.error);
  if (transfers.error) console.error("KYC LIMIT TRANSFER SUM ERROR:", transfers.error);
  if (orders.error) console.error("KYC LIMIT ORDER SUM ERROR:", orders.error);

  return {
    topup: sum(topups.data as Array<Record<string, unknown>> | null, "amount"),
    transfer: sum(transfers.data as Array<Record<string, unknown>> | null, "amount"),
    purchase: sum(
      orders.data as Array<Record<string, unknown>> | null,
      "total_amount",
      new Set(["FAILED", "CANCELLED", "REFUNDED"])
    ),
  };
}

/**
 * Periksa batas per transaksi dan per hari sebelum transaksi dijalankan.
 * Nominal 0 / tidak valid dianggap tidak dibatasi. Kegagalan membaca data
 * tidak boleh memblokir transaksi pengguna (fail-open) selain status KYC.
 */
export async function checkKycLimit(
  userId: string,
  kind: KycLimitKind,
  amount: number
): Promise<KycCheckResult> {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: true };

  const settings = await getSetting(LEVEL_KYC_SETTINGS_KEY, DEFAULT_LEVEL_KYC_SETTINGS);
  const status = await kycLimitStatusForUser(userId);
  const limits = limitsForStatus(settings, status);

  const perTxLimit = kind === "topup" ? limits.maxTopupPerTx : kind === "transfer" ? limits.maxTransferPerTx : 0;
  if (limitExceeded(value, perTxLimit)) {
    return {
      ok: false,
      status: 403,
      message: `Batas ${KIND_LABEL[kind]} per transaksi Anda ${formatRupiah(perTxLimit)}. ${VERIFY_HINT}`,
    };
  }

  let dailyLimit = 0;
  if (kind === "topup") dailyLimit = limits.maxTopupPerDay;
  if (kind === "transfer") dailyLimit = limits.maxTransferPerDay;
  if (kind === "purchase") dailyLimit = limits.maxPurchasePerDay;
  if (dailyLimit <= 0) return { ok: true };

  const usage = await loadDailyUsage(userId, wibDayStartIso());
  const used = kind === "topup" ? usage.topup : kind === "transfer" ? usage.transfer : usage.purchase;
  if (used + value > dailyLimit) {
    const label = kind === "topup" ? "Top Up" : kind === "purchase" ? "pembelian" : "transfer";
    return {
      ok: false,
      status: 403,
      message: `Batas ${label} harian Anda ${formatRupiah(dailyLimit)}. ${VERIFY_HINT}`,
    };
  }

  return { ok: true };
}
