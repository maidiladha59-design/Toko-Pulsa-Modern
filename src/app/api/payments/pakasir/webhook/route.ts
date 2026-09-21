import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPakasirTransactionDetail, isPakasirConfigured, verifyPakasirWebhookSecret } from "@/lib/pakasir";
import { fulfillPpobOrder } from "@/lib/ppob/fulfill";
import { notifyUser } from "@/lib/notification-engine";

// v2: payload webhook TIDAK lagi berisi "project" maupun "payment_method".
const webhookSchema = z.object({
  txn_id: z.string(),
  order_id: z.string(),
  amount: z.number(),
  is_sandbox: z.boolean().optional(),
  status: z.string(),
  completed_at: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  if (!isPakasirConfigured()) return NextResponse.json({ ok: true });

  // Lapisan pertama: verifikasi header X-Secret (fitur baru di API v2).
  const secretHeader = request.headers.get("x-secret");
  const secretValid = verifyPakasirWebhookSecret(secretHeader);
  if (!secretValid && process.env.NODE_ENV === "production") {
    // Di production, tolak langsung kalau secret tidak cocok/tidak diset.
    return NextResponse.json({ ok: true }, { status: 401 });
  }

  const rawBody = await request.text();
  let body: unknown = null;
  try { body = JSON.parse(rawBody || "null"); } catch { return NextResponse.json({ ok: true }); }
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });
  const payload = parsed.data;
  const admin = createAdminClient();

  // Lapisan kedua (tetap dipertahankan): body webhook tidak pernah dipercaya
  // begitu saja walau X-Secret valid — status selalu dikonfirmasi ulang lewat
  // Transaction Status API menggunakan txn_id.
  const eventKey = crypto.createHash("sha256").update(`${payload.txn_id}|${payload.order_id}|${payload.amount}|${payload.status}|${payload.completed_at || ""}`).digest("hex");

  // TOPUP webhook path: same Pakasir webhook URL can safely handle both orders and wallet deposits.
  if (payload.order_id.startsWith("TOPUP-")) {
    const { data: topup } = await admin
      .from("topups")
      .select("id, user_id, amount, status, provider, provider_order_id, provider_txn_id, payment_method, gateway_total_payment, payment_amount, webhook_event_key")
      .eq("provider_order_id", payload.order_id)
      .maybeSingle();

    if (!topup || topup.provider !== "pakasir" || Number(topup.payment_amount || topup.amount) !== Number(payload.amount)) return NextResponse.json({ ok: true });
    if (topup.provider_txn_id && topup.provider_txn_id !== payload.txn_id) return NextResponse.json({ ok: true });
    if (topup.status === "APPROVED") return NextResponse.json({ ok: true, duplicate: true });

    const { data: event } = await admin.from("ppob_webhook_events").insert({
      provider: "pakasir",
      event_key: `topup:${eventKey}`,
      payload: payload,
      status: "RECEIVED",
    }).select("id").maybeSingle();

    if (!event) return NextResponse.json({ ok: true, duplicate: true });

    try {
      const statusTxnId = topup.provider_txn_id || payload.txn_id;
      const detail = await getPakasirTransactionDetail(statusTxnId);
      const valid = detail.order_id === payload.order_id && detail.txn_id === statusTxnId && detail.status === "completed" && Number(detail.amount) === Number(topup.payment_amount || topup.amount);
      if (!valid) {
        await admin.from("ppob_webhook_events").update({ status: "IGNORED", error_message: "PAYMENT_NOT_CONFIRMED", processed_at: new Date().toISOString() }).eq("id", event.id);
        return NextResponse.json({ ok: true });
      }

      // v2: payment_method tidak lagi dikirim di webhook/status, pakai yang sudah tersimpan saat create.
      const { error } = await admin.rpc("confirm_pakasir_topup", {
        p_topup_id: topup.id,
        p_payment_method: topup.payment_method || "unknown",
        p_completed_at: detail.completed_at || payload.completed_at || new Date().toISOString(),
      });
      if (error) throw error;
      await notifyUser({ userId: topup.user_id, eventKey: "TOPUP_SUCCESS", variables: { amount: `Rp${Number(topup.amount).toLocaleString("id-ID")}`, reference: topup.provider_order_id }, referenceType: "topup", referenceId: topup.id, url: "/wallet/topup" });

      await admin.from("ppob_webhook_events").update({ status: "PROCESSED", processed_at: new Date().toISOString() }).eq("id", event.id);
      return NextResponse.json({ ok: true });
    } catch (error: any) {
      await admin.from("ppob_webhook_events").update({ status: "ERROR", error_message: String(error?.message || error), processed_at: new Date().toISOString() }).eq("id", event.id);
      console.error("PAKASIR TOPUP WEBHOOK ERROR:", error);
      return NextResponse.json({ ok: true });
    }
  }

  // Existing order payment path.
  // orders.gateway_reference = order_id yang kita kirim ke Pakasir (order_number),
  // orders.gateway_txn_id    = txn_id milik Pakasir (diisi saat order dibuat, v73).
  const { data: order } = await admin
    .from("orders")
    .select("id, status, payment_method, gateway_method, total_amount, gateway_reference, gateway_txn_id")
    .eq("gateway_reference", payload.order_id)
    .in("payment_method", ["QRIS", "BANK_VA"])
    .maybeSingle();

  if (!order || order.status !== "PENDING") return NextResponse.json({ ok: true });

  // Bila txn_id sudah tersimpan, webhook harus membawa txn_id yang sama.
  if (order.gateway_txn_id && order.gateway_txn_id !== payload.txn_id) return NextResponse.json({ ok: true });

  try {
    // Order lama (sebelum v73) belum punya gateway_txn_id: pakai txn_id dari payload,
    // tetap aman karena order_id + nominal dicocokkan ulang dengan respons Pakasir.
    const statusTxnId = order.gateway_txn_id || payload.txn_id;
    const detail = await getPakasirTransactionDetail(statusTxnId);
    if (detail.txn_id === statusTxnId && detail.order_id === payload.order_id && detail.status === "completed" && Number(detail.amount) === Number(order.total_amount) && Number(payload.amount) === Number(order.total_amount)) {
      const { error } = await admin.rpc("confirm_gateway_payment", { p_order_id: order.id });
      if (error) console.error("CONFIRM PAYMENT ERROR:", error);
      else {
        if (!order.gateway_txn_id) await admin.from("orders").update({ gateway_txn_id: statusTxnId }).eq("id", order.id).is("gateway_txn_id", null);
        const { data: ready } = await admin.from("ppob_transactions").select("id").eq("order_id", order.id).neq("customer_no", "pending-target").limit(1);
        if (ready?.length) await fulfillPpobOrder(order.id);
        const { data: orderUser } = await admin.from("orders").select("user_id").eq("id", order.id).single();
        if (orderUser) await notifyUser({ userId: orderUser.user_id, eventKey: "TRANSACTION_SUCCESS", variables: { amount: `Rp${Number(order.total_amount).toLocaleString("id-ID")}`, reference: order.id }, referenceType: "order", referenceId: order.id, url: `/orders/${order.id}` });
      }
    }
  } catch (e) { console.error("PAKASIR WEBHOOK VERIFY ERROR:", e); }

  return NextResponse.json({ ok: true });
}