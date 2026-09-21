import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPakasirTransaction, extractPakasirPaymentNumber, isPakasirConfigured, type PakasirMethod } from "@/lib/pakasir";
import QRCode from "qrcode";

const bodySchema = z.object({
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
  idempotency_key: z.string().min(10),
  voucher_code: z.string().trim().max(64).optional(),
  targets: z.record(z.object({ customer_no: z.string().min(3).max(64), target_data: z.record(z.unknown()).optional() })).optional(),
  method: z.enum([
    "qris",
    "bri_va",
    "bni_va",
    "cimb_niaga_va",
    "sampoerna_va",
    "bnc_va",
    "maybank_va",
    "permata_va",
    "atm_bersama_va",
    "artha_graha_va",
  ]),
});

export async function POST(request: Request) {
  if (!isPakasirConfigured()) {
    return NextResponse.json(
      { message: "Pembayaran otomatis belum dikonfigurasi. Tambahkan PAKASIR_PROJECT dan PAKASIR_API_KEY di environment server." },
      { status: 503 }
    );
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", user.id).single();
  if (profile?.account_type !== "RESELLER") return NextResponse.json({ message: "Layanan pembayaran gateway ini memerlukan verifikasi KYC. Silakan verifikasi akun terlebih dahulu." }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Data pembayaran tidak valid." }, { status: 400 });

  const { items, idempotency_key, method, targets = {}, voucher_code } = parsed.data;

  const { data: order, error } = await supabase.rpc("create_gateway_order", {
    p_user_id: user.id,
    p_items: items,
    p_idempotency_key: idempotency_key,
    p_payment_method: method === "qris" ? "QRIS" : "BANK_VA",
    p_gateway_method: method,
  }).single();

  if (error || !order) {
    const m = error?.message || "";
    if (m.includes("PRODUCT_NOT_FOUND")) return NextResponse.json({ message: "Produk tidak ditemukan atau sudah tidak tersedia." }, { status: 404 });
    if (m.includes("INVALID_ITEM") || m.includes("INVALID_QUANTITY") || m.includes("INVALID_ITEMS")) return NextResponse.json({ message: "Data produk atau jumlah tidak valid." }, { status: 400 });
    if (m.includes("ORDER_ALREADY_PAID")) return NextResponse.json({ message: "Pesanan ini sudah dibayar." }, { status: 409 });
    if (process.env.NODE_ENV !== "production") console.error("GATEWAY ORDER ERROR:", error);
    return NextResponse.json({ message: "Gagal membuat pesanan pembayaran. Silakan coba lagi." }, { status: 500 });
  }

  const o = order as { order_id: string; order_number: string; total_amount: number; gateway_method?: string; payment_number?: string | null; expired_at?: string | null; };
  const admin = createAdminClient();


  // Simpan target PPOB sebelum pembayaran agar transaksi yang sudah dibayar
  // tidak pernah dikirim ke provider tanpa nomor tujuan.
  const { data: ppobItems } = await admin
    .from("order_items")
    .select("id, product_id, ppob_services(id, provider, provider_sku, service_kind)")
    .eq("order_id", o.order_id);
  for (const item of (ppobItems || []) as any[]) {
    const service = Array.isArray(item.ppob_services) ? item.ppob_services[0] : item.ppob_services;
    if (!service) continue;
    const target = (targets as any)[item.product_id] || (targets as any)[item.id];
    if (!target?.customer_no) {
      await admin.from("orders").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", o.order_id).eq("status", "PENDING");
      return NextResponse.json({ message: `Nomor tujuan untuk produk ${item.product_id} wajib diisi.` }, { status: 400 });
    }
    const providerRef = `AS-${o.order_id.replaceAll("-", "")}-${item.id.replaceAll("-", "")}`;
    const { error: targetError } = await admin.from("ppob_order_targets").upsert({ order_item_id: item.id, customer_no: target.customer_no, target_data: target.target_data || {}, updated_at: new Date().toISOString() }, { onConflict: "order_item_id" });
    if (targetError) {
      await admin.from("orders").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", o.order_id).eq("status", "PENDING");
      return NextResponse.json({ message: "Data tujuan PPOB tidak dapat disimpan." }, { status: 500 });
    }
    const { error: txError } = await admin.from("ppob_transactions").upsert({ order_id: o.order_id, order_item_id: item.id, service_id: service.id, provider: service.provider, provider_ref_id: providerRef, customer_no: target.customer_no, target_data: target.target_data || {}, status: "WAITING" }, { onConflict: "order_item_id", ignoreDuplicates: true });
    if (txError) {
      await admin.from("orders").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", o.order_id).eq("status", "PENDING");
      return NextResponse.json({ message: "Transaksi PPOB tidak dapat disiapkan." }, { status: 500 });
    }
  }

  if (voucher_code) {
    const { error: voucherError } = await supabase.rpc("apply_voucher_to_pending_order", { p_order_id: o.order_id, p_code: voucher_code });
    if (voucherError) {
      await admin.from("orders").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", o.order_id).eq("status", "PENDING");
      return NextResponse.json({ message: voucherError.message.replaceAll("_", " ") }, { status: 400 });
    }
  }

  // Retry aman: bila transaksi gateway sudah tersimpan, jangan membuat transaksi kedua.
  const { data: existing } = await admin
    .from("orders")
    .select("payment_number, qris_payload, qris_expired_at, total_amount, status, payment_method")
    .eq("id", o.order_id)
    .single();

  const existingNumber = existing?.payment_number || existing?.qris_payload;
  if (existingNumber && existing?.status === "PENDING") {
    const isQris = existing.payment_method === "QRIS";
    return NextResponse.json({
      order_id: o.order_id,
      order_number: o.order_number,
      amount: existing.total_amount,
      payment_method: existing.payment_method,
      payment_number: existingNumber,
      expired_at: existing.qris_expired_at,
      qris_image: isQris ? await QRCode.toDataURL(existingNumber, { margin: 1, width: 360 }) : null,
    }, { status: 201 });
  }

  try {
    const payment = await createPakasirTransaction(o.order_number, Number(existing?.total_amount ?? o.total_amount), method as PakasirMethod);
    const isQris = method === "qris";
    const paymentNumber = extractPakasirPaymentNumber(payment);
    const totalPayment = payment.total_payment ?? Number(existing?.total_amount ?? o.total_amount);
    if (!payment.txn_id || !paymentNumber) throw new Error("PAKASIR_INVALID_RESPONSE");
    const { error: saveError } = await admin.from("orders").update({
      payment_method: isQris ? "QRIS" : "BANK_VA",
      gateway_reference: o.order_number,
      gateway_txn_id: payment.txn_id,
      gateway_method: method,
      payment_number: paymentNumber,
      qris_payload: isQris ? paymentNumber : null,
      qris_expired_at: payment.expired_at,
      gateway_fee: payment.fee ?? 0,
      gateway_total_payment: totalPayment,
      updated_at: new Date().toISOString(),
    }).eq("id", o.order_id).eq("status", "PENDING");

    if (saveError) throw saveError;

    return NextResponse.json({
      order_id: o.order_id,
      order_number: o.order_number,
      amount: totalPayment,
      base_amount: payment.amount,
      fee: payment.fee ?? 0,
      payment_method: isQris ? "QRIS" : "BANK_VA",
      gateway_method: method,
      payment_number: paymentNumber,
      expired_at: payment.expired_at,
      qris_image: isQris ? await QRCode.toDataURL(paymentNumber, { margin: 1, width: 360 }) : null,
    }, { status: 201 });
  } catch (gatewayError) {
    await admin.from("orders").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", o.order_id).eq("status", "PENDING");
    if (process.env.NODE_ENV !== "production") console.error("GATEWAY CREATE ERROR:", gatewayError);
    return NextResponse.json({ message: "Gagal membuat instruksi pembayaran. Silakan coba lagi." }, { status: 502 });
  }
}
