import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGatewayTransaction, isGatewayConfigured, type GatewayMethod } from "@/lib/fr3newera";

// FR3 NEWERA hanya menyediakan QRIS (tidak ada Virtual Account seperti Pakasir).
const METHODS = ["qris"] as const;
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

// FR3 NEWERA hanya QRIS — nomor pembayaran selalu dari qr_string.
function extractPaymentNumber(payment: { payment_method: string; qr_string?: string }) {
  return payment.qr_string || "";
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
    return NextResponse.json({ ...cfg, deadline_minutes });
  } catch {
    return NextResponse.json({ message: "Pengaturan biaya Top Up belum tersedia. Jalankan migration v35." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isGatewayConfigured()) return NextResponse.json({ message: "Top Up otomatis belum dikonfigurasi. Tambahkan FR3NEWERA_API_KEY di environment server." }, { status: 503 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Nominal, metode pembayaran, atau idempotency key tidak valid." }, { status: 400 });

  const { amount, method, idempotency_key } = parsed.data;
  const admin = createAdminClient();
  const deadlineMinutes = await getDeadlineMinutes(admin);
  // Expire stale unpaid top-up before enforcing the one-active-top-up rule.
  const { data: activeTopup } = await admin.from("topups").select("id,status,expires_at,amount,payment_amount,payment_method,payment_number,provider_order_id,admin_fee,gateway_fee,gateway_total_payment,idempotency_key").eq("user_id", user.id).in("status", ["PENDING","VERIFYING"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (activeTopup?.expires_at && new Date(activeTopup.expires_at).getTime() <= Date.now()) {
    await admin.from("topups").update({ status: "EXPIRED", updated_at: new Date().toISOString() }).eq("id", activeTopup.id).in("status", ["PENDING","VERIFYING"]);
  } else if (activeTopup && activeTopup.provider_order_id && activeTopup.idempotency_key !== idempotency_key) {
    return NextResponse.json({ message: "Masih ada Top Up yang belum selesai. Selesaikan pembayaran atau batalkan Top Up sebelumnya terlebih dahulu.", active_topup: activeTopup }, { status: 409 });
  }
  let cfg: FeeConfig;
  try { cfg = await getFeeConfig(admin, feeGroup(method)); } catch { return NextResponse.json({ message: "Pengaturan biaya Top Up belum tersedia. Jalankan migration v35." }, { status: 503 }); }
  if (amount < cfg.min_topup || amount > cfg.max_topup) return NextResponse.json({ message: `Nominal Top Up harus antara Rp${cfg.min_topup.toLocaleString("id-ID")} dan Rp${cfg.max_topup.toLocaleString("id-ID")}.` }, { status: 400 });

  const adminFee = calculateFee(amount, cfg);
  const paymentAmount = amount + adminFee;
  const { data: existing } = await admin.from("topups").select("id, amount, admin_fee, payment_amount, status, provider_order_id, payment_method, payment_number, gateway_fee, gateway_total_payment, expires_at").eq("idempotency_key", idempotency_key).eq("user_id", user.id).maybeSingle();
  if (existing?.provider_order_id && ["PENDING", "VERIFYING"].includes(existing.status)) {
    return NextResponse.json({ id: existing.id, amount: existing.amount, admin_fee: existing.admin_fee ?? 0, payment_amount: existing.payment_amount ?? existing.amount + (existing.admin_fee ?? 0), status: existing.status, order_id: existing.provider_order_id, payment_method: existing.payment_method, payment_number: existing.payment_number, fee: existing.gateway_fee ?? 0, total_payment: existing.gateway_total_payment, expired_at: existing.expires_at }, { status: 200 });
  }

  const providerOrderId = `TOPUP-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const { data: topup, error: insertError } = await admin.from("topups").insert({ user_id: user.id, amount, admin_fee: adminFee, payment_amount: paymentAmount, fee_group: feeGroup(method), fee_type: cfg.fee_type, fee_rate: cfg.fee_type === "PERCENTAGE" ? cfg.fee_value : null, status: "PENDING", idempotency_key, provider: "fr3newera", provider_order_id: providerOrderId, payment_method: method }).select("id").single();
  if (insertError || !topup) {
    const { data: raced } = await admin.from("topups").select("id, amount, admin_fee, payment_amount, status, provider_order_id, payment_method, payment_number, gateway_fee, gateway_total_payment, expires_at").eq("idempotency_key", idempotency_key).eq("user_id", user.id).maybeSingle();
    if (raced?.provider_order_id) return NextResponse.json({ id: raced.id, amount: raced.amount, admin_fee: raced.admin_fee ?? 0, payment_amount: raced.payment_amount ?? raced.amount + (raced.admin_fee ?? 0), status: raced.status, order_id: raced.provider_order_id, payment_method: raced.payment_method, payment_number: raced.payment_number, fee: raced.gateway_fee ?? 0, total_payment: raced.gateway_total_payment, expired_at: raced.expires_at }, { status: 200 });
    return NextResponse.json({ message: "Gagal membuat transaksi Top Up." }, { status: 500 });
  }

  try {
    const payment = await createGatewayTransaction(providerOrderId, paymentAmount, method as GatewayMethod);
    const paymentNumber = extractPaymentNumber(payment);
    const providerExpiry = new Date(payment.expired_at).getTime();
    const adminExpiry = Date.now() + deadlineMinutes * 60 * 1000;
    const effectiveExpiry = new Date(Math.min(providerExpiry, adminExpiry)).toISOString();
    const { error: updateError } = await admin.from("topups").update({
      payment_number: paymentNumber,
      provider_txn_id: payment.txn_id,
      gateway_fee: payment.fee ?? 0,
      gateway_total_payment: payment.total_payment ?? paymentAmount,
      expires_at: effectiveExpiry,
      updated_at: new Date().toISOString(),
    }).eq("id", topup.id).eq("status", "PENDING");
    if (updateError) throw updateError;
    return NextResponse.json({ id: topup.id, amount, admin_fee: adminFee, payment_amount: paymentAmount, status: "PENDING", order_id: providerOrderId, payment_method: payment.payment_method, payment_number: paymentNumber, fee: payment.fee ?? 0, total_payment: payment.total_payment ?? paymentAmount, expired_at: effectiveExpiry }, { status: 201 });
  } catch (error) {
    await admin.from("topups").update({ status: "CANCELLED", updated_at: new Date().toISOString() }).eq("id", topup.id).eq("status", "PENDING");
    if (process.env.NODE_ENV !== "production") console.error("TOPUP FR3NEWERA CREATE ERROR:", error);
    return NextResponse.json({ message: "Gagal membuat instruksi pembayaran Top Up." }, { status: 502 });
  }
}