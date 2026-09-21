import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPakasirTransaction, extractPakasirPaymentNumber, isPakasirConfigured } from "@/lib/pakasir";
import QRCode from "qrcode";

const bodySchema = z.object({
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
  idempotency_key: z.string().min(10),
  voucher_code: z.string().trim().max(64).optional(),
  targets: z.record(z.object({ customer_no: z.string().min(3).max(64), target_data: z.record(z.unknown()).optional() })).optional(),
});

// Membuat order QRIS: order & item disimpan dulu (status PENDING, saldo TIDAK
// disentuh), lalu transaksi dibuat di Pakasir untuk mendapatkan QR code.
export async function POST(request: Request) {
  if (!isPakasirConfigured()) {
    return NextResponse.json({ message: "Pembayaran QRIS belum dikonfigurasi. Silakan hubungi admin." }, { status: 503 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Data checkout tidak valid." }, { status: 400 });
  }
  const { items, idempotency_key, targets = {}, voucher_code } = parsed.data;

  const { data: order, error } = await supabase
    .rpc("create_qris_order", { p_user_id: user.id, p_items: items, p_idempotency_key: idempotency_key })
    .single();

  if (error || !order) {
    const m = error?.message || "";
    if (m.includes("PRODUCT_NOT_FOUND")) return NextResponse.json({ message: "Produk tidak ditemukan atau sudah tidak tersedia." }, { status: 404 });
    if (m.includes("INVALID_ITEM") || m.includes("INVALID_QUANTITY") || m.includes("INVALID_ITEMS")) return NextResponse.json({ message: "Data produk atau jumlah tidak valid." }, { status: 400 });
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ message: `Gagal membuat order: ${m}` }, { status: 500 });
    return NextResponse.json({ message: "Gagal membuat order. Silakan coba lagi." }, { status: 500 });
  }

  const { order_id, order_number, total_amount } = order as { order_id: string; order_number: string; total_amount: number };

  // Kalau order ini sudah pernah dibuat transaksi Pakasir-nya (retry/double click),
  // pakai payload yang sudah ada supaya tidak membuat transaksi duplikat.
  const admin = createAdminClient();


  // PPOB target data must be captured before any payment can be considered ready
  // for fulfillment. This prevents a paid order from being sent to a supplier
  // with a missing/placeholder destination.
  const { data: ppobItems } = await admin
    .from('order_items')
    .select('id, product_id, ppob_services(id, provider, provider_sku, service_kind)')
    .eq('order_id', order_id);

  for (const item of (ppobItems || []) as any[]) {
    const service = Array.isArray(item.ppob_services) ? item.ppob_services[0] : item.ppob_services;
    if (!service) continue;
    const target = (targets as any)[item.product_id] || (targets as any)[item.id];
    if (!target?.customer_no) {
      await admin.from('orders').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', order_id).eq('status', 'PENDING');
      return NextResponse.json({ message: `Nomor tujuan untuk produk ${item.product_id} wajib diisi.` }, { status: 400 });
    }
    const providerRef = `AS-${order_id.replaceAll('-', '')}-${item.id.replaceAll('-', '')}`;
    const { error: targetError } = await admin.from('ppob_order_targets').upsert({
      order_item_id: item.id,
      customer_no: target.customer_no,
      target_data: target.target_data || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_item_id' });
    if (targetError) {
      await admin.from('orders').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', order_id).eq('status', 'PENDING');
      return NextResponse.json({ message: 'Data tujuan PPOB tidak dapat disimpan.' }, { status: 500 });
    }
    const { error: txError } = await admin.from('ppob_transactions').upsert({
      order_id,
      order_item_id: item.id,
      service_id: service.id,
      provider: service.provider,
      provider_ref_id: providerRef,
      customer_no: target.customer_no,
      target_data: target.target_data || {},
      status: 'WAITING',
    }, { onConflict: 'order_item_id', ignoreDuplicates: true });
    if (txError) {
      await admin.from('orders').update({ status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', order_id).eq('status', 'PENDING');
      return NextResponse.json({ message: 'Transaksi PPOB tidak dapat disiapkan.' }, { status: 500 });
    }
  }

  if (voucher_code) {
    const { error: voucherError } = await supabase.rpc("apply_voucher_to_pending_order", { p_order_id: order_id, p_code: voucher_code });
    if (voucherError) {
      await admin.from("orders").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", order_id).eq("status", "PENDING");
      return NextResponse.json({ message: voucherError.message.replaceAll("_", " ") }, { status: 400 });
    }
  }

  const { data: existingOrder } = await admin.from("orders").select("qris_payload, qris_expired_at, status, total_amount").eq("id", order_id).single();
  const payableAmount = Number(existingOrder?.total_amount ?? total_amount);

  if (existingOrder?.qris_payload && existingOrder.status === "PENDING") {
    const qrImage = await QRCode.toDataURL(existingOrder.qris_payload, { margin: 1, width: 320 });
    return NextResponse.json({ order_id, order_number, amount: payableAmount, qris_image: qrImage, expired_at: existingOrder.qris_expired_at }, { status: 201 });
  }

  try {
    const payment = await createPakasirTransaction(order_number, payableAmount, "qris");
    const qrString = extractPakasirPaymentNumber(payment);
    if (!payment.txn_id || !qrString) throw new Error("PAKASIR_INVALID_RESPONSE");
    const { error: saveError } = await admin.from("orders").update({
      gateway_reference: order_number,
      gateway_txn_id: payment.txn_id,
      gateway_method: "qris",
      qris_payload: qrString,
      payment_number: qrString,
      qris_expired_at: payment.expired_at,
      gateway_fee: payment.fee ?? 0,
      gateway_total_payment: payment.total_payment ?? payableAmount,
      updated_at: new Date().toISOString(),
    }).eq("id", order_id).eq("status", "PENDING");
    if (saveError) throw saveError;
    const qrImage = await QRCode.toDataURL(qrString, { margin: 1, width: 320 });
    return NextResponse.json({ order_id, order_number, amount: payment.total_payment ?? payableAmount, expired_at: payment.expired_at, qris_image: qrImage }, { status: 201 });
  } catch (gatewayError: any) {
    // Order sudah terlanjur dibuat; tandai gagal supaya tidak menggantung sebagai PENDING kosong.
    await admin.from("orders").update({ status: "FAILED", updated_at: new Date().toISOString() }).eq("id", order_id);
    const msg = String(gatewayError?.message || "");
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ message: `Gagal membuat QRIS: ${msg}` }, { status: 502 });
    }
    return NextResponse.json({ message: "Gagal membuat kode QRIS. Silakan coba lagi." }, { status: 502 });
  }
}
