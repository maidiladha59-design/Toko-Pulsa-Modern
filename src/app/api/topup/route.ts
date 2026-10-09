import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGatewayTransaction, extractGatewayPaymentNumber, isGatewayConfigured, GatewayError, GATEWAY_PROVIDER, GATEWAY_METHODS } from "@/lib/midtrans";

// Midtrans Core API: QRIS + Virtual Account bca/bni/bri/permata.
const METHODS = GATEWAY_METHODS;
const bodySchema = z.object({ amount: z.number().int().positive(), method: z.enum(METHODS).default("qris"), idempotency_key: z.string().min(10).max(120) });

type FeeConfig = { enabled: boolean; fee_type: "FIXED" | "PERCENTAGE"; fee_value: number; min_topup: number; max_topup: number };

async function getDeadlineMinutes(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from("topup_fee_settings").select("deadline_minutes").eq("id", 1).maybeSingle();
  const value = Number(data?.deadline_minutes || 30);
  return Math.min(1440, Math.max(5, Number.isFinite(value) ? value : 30));
}
function calculateFee(amount: number, cfg: FeeConfig) {
  if (!cfg.enabled || cfg.fee_value <= 0) return 0;
  return cfg.fee_type === "PERCENTAGE" ? Math.max(0, Math.round(amount * cfg.fee_value / 100)) : Math.max(0, Math.round(cfg.fee_value));
}

type TopupFeeTier = { min_amount: number; max_amount: number | null; fee_amount: number };

// Biaya bertingkat v80. Kalau tabel topup_fee_tiers belum ada / belum diisi,
// kembalikan array kosong supaya perhitungan lama tetap dipakai sebagai cadangan.
async function getActiveTiers(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.from("topup_fee_tiers").select("min_amount, max_amount, fee_amount").eq("is_active", true).order("sort_order", { ascending: true }).order("min_amount", { ascending: true });
  if (error || !data) return [] as TopupFeeTier[];
  return data.map((t) => ({ min_amount: Number(t.min_amount), max_amount: t.max_amount == null ? null : Number(t.max_amount), fee_amount: Number(t.fee_amount) })) as TopupFeeTier[];
}
function findTierFee(amount: number, tiers: TopupFeeTier[]) {
  const tier = tiers.find((t) => amount >= t.min_amount && (t.max_amount == null || amount <= t.max_amount));
  return tier ? tier.fee_amount : null;
}

async function getFeeConfig(admin: ReturnType<typeof createAdminClient>, group: string) {
  const { data, error } = await admin.from("topup_fee_methods").select("enabled, fee_type, fee_value, min_topup, max_topup").eq("payment_group", group).single();
  if (error || !data) throw new Error("TOPUP_FEE_CONFIG_UNAVAILABLE");
  return { ...data, fee_value: Number(data.fee_value), min_topup: Number(data.min_topup), max_topup: Number(data.max_topup) } as FeeConfig;
}
function feeGroup(method: string) {
  if (method === "qris") return "qris";
  if (["bnc_va","sampoerna_va","maybank_va"].includes(method)) return "bank_digital";
  return "bank";
}

export async function GET(request: Request) {
  if (!isGatewayConfigured()) return NextResponse.json({ message: "Top Up otomatis belum dikonfigurasi." }, { status: 503 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  try {
    const admin = createAdminClient();
    const method = new URL(request.url).searchParams.get("method") || "qris";
    const cfg = await getFeeConfig(admin, feeGroup(method));
    const deadline_minutes = await getDeadlineMinutes(admin);
    const tiers = await getActiveTiers(admin);
    return NextResponse.json({ ...cfg, deadline_minutes, tiers });
  } catch {
    return NextResponse.json({ message: "Pengaturan biaya Top Up belum tersedia. Jalankan migration v35." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  // Validasi env di awal. Yang dilog hanya true/false — tidak pernah nilainya.
  const serverKeySet = Boolean(String(process.env.MIDTRANS_SERVER_KEY || "").trim());
  const modeSet = ["true", "1", "yes", "false", "0", "no"].includes(String(process.env.MIDTRANS_IS_PRODUCTION || "").trim().toLowerCase());
  if (!serverKeySet || !modeSet) {
    console.error("[topup] env Midtrans belum diset", JSON.stringify({ server_key_set: serverKeySet, is_production_set: modeSet }));
    return NextResponse.json({ ok: false, error: "Konfigurasi pembayaran belum lengkap", code: "GATEWAY_NOT_CONFIGURED" }, { status: 500 });
  }

  const supabase = createClient();
  const admin = createAdminClient();
  let step = "auth";
  let orderId: string | null = null;
  let topupId: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Silakan login terlebih dahulu.", code: "UNAUTHENTICATED" }, { status: 401 });

    step = "parse_body";
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Nominal, metode pembayaran, atau idempotency key tidak valid.", code: "INVALID_INPUT" }, { status: 400 });

    const { amount, method, idempotency_key } = parsed.data;
    const deadlineMinutes = await getDeadlineMinutes(admin);
    // Expire stale unpaid top-up before enforcing the one-active-top-up rule.
    step = "check_active_topup";
    const { data: activeTopup } = await admin.from("topups").select("id,status,expires_at,amount,payment_amount,payment_method,payment_number,provider_order_id,admin_fee,gateway_fee,gateway_total_payment,idempotency_key").eq("user_id", user.id).in("status", ["PENDING","VERIFYING"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (activeTopup?.expires_at && new Date(activeTopup.expires_at).getTime() <= Date.now()) {
      await admin.from("topups").update({ status: "EXPIRED", updated_at: new Date().toISOString() }).eq("id", activeTopup.id).in("status", ["PENDING","VERIFYING"]);
    } else if (activeTopup && activeTopup.provider_order_id && activeTopup.idempotency_key !== idempotency_key) {
      return NextResponse.json({ ok: false, error: "Masih ada Top Up yang belum selesai. Selesaikan pembayaran atau batalkan Top Up sebelumnya terlebih dahulu.", code: "ACTIVE_TOPUP_EXISTS", active_topup: activeTopup }, { status: 409 });
    }

    step = "fee_config";
    let cfg: FeeConfig;
    try { cfg = await getFeeConfig(admin, feeGroup(method)); } catch { return NextResponse.json({ ok: false, error: "Pengaturan biaya Top Up belum tersedia. Jalankan migration v35.", code: "FEE_CONFIG_UNAVAILABLE" }, { status: 503 }); }
    // Tier aktif (v80) diprioritaskan; nominal yang cocok tier boleh di luar rentang
    // lama (mis. Rp1.000 dengan min_topup lama Rp10.000). Kalau tidak cocok tier
    // manapun, batas & tarif lama tetap berlaku sebagai cadangan.
    const tiers = await getActiveTiers(admin);
    const tierFee = findTierFee(amount, tiers);
    const inLegacyRange = amount >= cfg.min_topup && amount <= cfg.max_topup;
    if (tierFee === null && !inLegacyRange) return NextResponse.json({ ok: false, error: tiers.length ? "Nominal Top Up tidak termasuk rentang biaya yang tersedia. Periksa kembali nominal atau hubungi admin." : `Nominal Top Up harus antara Rp${cfg.min_topup.toLocaleString("id-ID")} dan Rp${cfg.max_topup.toLocaleString("id-ID")}.`, code: "AMOUNT_OUT_OF_RANGE" }, { status: 400 });

    const adminFee = tierFee !== null ? tierFee : calculateFee(amount, cfg);
    const paymentAmount = amount + adminFee;

    step = "check_existing";
    const { data: existing } = await admin.from("topups").select("id, amount, admin_fee, payment_amount, status, provider_order_id, payment_method, payment_number, gateway_fee, gateway_total_payment, expires_at").eq("idempotency_key", idempotency_key).eq("user_id", user.id).maybeSingle();
    if (existing?.provider_order_id && ["PENDING", "VERIFYING"].includes(existing.status)) {
      return NextResponse.json({ ok: true, id: existing.id, amount: existing.amount, admin_fee: existing.admin_fee ?? 0, payment_amount: existing.payment_amount ?? existing.amount + (existing.admin_fee ?? 0), status: existing.status, order_id: existing.provider_order_id, payment_method: existing.payment_method, payment_number: existing.payment_number, fee: existing.gateway_fee ?? 0, total_payment: existing.gateway_total_payment, expired_at: existing.expires_at }, { status: 200 });
    }

    step = "insert_topup";
    const providerOrderId = `TOPUP-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    orderId = providerOrderId;
    const { data: topup, error: insertError } = await admin.from("topups").insert({ user_id: user.id, amount, admin_fee: adminFee, payment_amount: paymentAmount, fee_group: feeGroup(method), fee_type: tierFee !== null ? "FIXED" : cfg.fee_type, fee_rate: tierFee !== null ? null : (cfg.fee_type === "PERCENTAGE" ? cfg.fee_value : null), status: "PENDING", idempotency_key, provider: GATEWAY_PROVIDER, provider_order_id: providerOrderId, payment_method: method }).select("id").single();
    if (insertError || !topup) {
      const { data: raced } = await admin.from("topups").select("id, amount, admin_fee, payment_amount, status, provider_order_id, payment_method, payment_number, gateway_fee, gateway_total_payment, expires_at").eq("idempotency_key", idempotency_key).eq("user_id", user.id).maybeSingle();
      if (raced?.provider_order_id) return NextResponse.json({ ok: true, id: raced.id, amount: raced.amount, admin_fee: raced.admin_fee ?? 0, payment_amount: raced.payment_amount ?? raced.amount + (raced.admin_fee ?? 0), status: raced.status, order_id: raced.provider_order_id, payment_method: raced.payment_method, payment_number: raced.payment_number, fee: raced.gateway_fee ?? 0, total_payment: raced.gateway_total_payment, expired_at: raced.expires_at }, { status: 200 });
      return NextResponse.json({ ok: false, error: "Gagal membuat transaksi Top Up.", code: "TOPUP_CREATE_FAILED" }, { status: 500 });
    }
    topupId = topup.id;

    step = "midtrans_charge";
    const payment = await createGatewayTransaction(providerOrderId, paymentAmount, method, { expiryMinutes: deadlineMinutes });
    const paymentNumber = extractGatewayPaymentNumber(payment);
    const providerExpiry = new Date(payment.expired_at).getTime();
    const adminExpiry = Date.now() + deadlineMinutes * 60 * 1000;
    const effectiveExpiry = new Date(Math.min(providerExpiry, adminExpiry)).toISOString();

    step = "update_topup";
    const { error: updateError } = await admin.from("topups").update({
      payment_number: paymentNumber,
      provider_txn_id: payment.txn_id,
      gateway_fee: payment.fee ?? 0,
      gateway_total_payment: payment.total_payment ?? paymentAmount,
      expires_at: effectiveExpiry,
      updated_at: new Date().toISOString(),
    }).eq("id", topup.id).eq("status", "PENDING");
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, id: topup.id, amount, admin_fee: adminFee, payment_amount: paymentAmount, status: "PENDING", order_id: providerOrderId, payment_method: payment.payment_method, payment_number: paymentNumber, fee: payment.fee ?? 0, total_payment: payment.total_payment ?? paymentAmount, expired_at: effectiveExpiry }, { status: 201 });
  } catch (error) {
    // Top up PENDING yang sudah dibuat dibatalkan supaya user bisa mencoba lagi.
    if (topupId) {
      await admin.from("topups").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", topupId).eq("status", "PENDING");
    }
    if (error instanceof GatewayError && error.kind === "TIMEOUT") {
      console.error("[topup] timeout ke Midtrans", JSON.stringify({ step, order_id: orderId }));
      return NextResponse.json({ ok: false, error: "Gateway pembayaran lambat merespons, coba lagi", code: "GATEWAY_TIMEOUT" }, { status: 504 });
    }
    // Log tanpa kredensial & tanpa data pribadi user: hanya step, order_id,
    // dan status dari respons Midtrans.
    const gateway = error instanceof GatewayError ? error : null;
    console.error("[topup] gagal", JSON.stringify({
      step,
      order_id: orderId,
      http_status: gateway?.httpStatus ?? null,
      status_code: gateway?.statusCode ?? null,
      status_message: gateway?.statusMessage ?? null,
      error: gateway ? null : error instanceof Error ? error.message : String(error),
    }));
    const midtransCode = Number(gateway?.statusCode);
    if (midtransCode === 401) return NextResponse.json({ ok: false, error: "Kunci pembayaran tidak valid", code: "GATEWAY_AUTH_INVALID" }, { status: 502 });
    if (midtransCode === 402) return NextResponse.json({ ok: false, error: "Metode pembayaran ini belum aktif", code: "GATEWAY_METHOD_INACTIVE" }, { status: 502 });
    if (midtransCode === 406) return NextResponse.json({ ok: false, error: "Transaksi duplikat, coba lagi", code: "GATEWAY_DUPLICATE" }, { status: 502 });
    return NextResponse.json({ ok: false, error: "Permintaan pembayaran ditolak, coba metode lain", code: "GATEWAY_REJECTED" }, { status: 502 });
  }
}