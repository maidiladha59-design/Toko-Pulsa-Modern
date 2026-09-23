import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGatewayTransactionDetail, isGatewayConfigured, verifyGatewayWebhookSignature } from "@/lib/fr3newera";
import { fulfillPpobOrder } from "@/lib/ppob/fulfill";
import { notifyUser } from "@/lib/notification-engine";

// FR3 NEWERA tidak mengirim order_id pada webhook (endpoint /topup mereka tidak
// menerima order_id sama sekali) — satu-satunya identitas transaksi adalah trxId.
// Karena wallet top-up dan order QRIS sama-sama memanggil endpoint /topup yang
// sama di FR3 NEWERA, webhook ini mencari trxId di tabel topups DULU, baru
// orders, untuk menentukan record internal mana yang harus diselesaikan.
const webhookSchema = z.object({
  trxId: z.string(),
  status: z.string(),
  amount: z.number().optional(),
});

export async function POST(request: Request) {
  if (!isGatewayConfigured()) return NextResponse.json({ ok: true });

  const rawBody = await request.text();

  // Lapisan pertama: verifikasi signature (skema HMAC generik — sesuaikan
  // dengan detail resmi dari dashboard FR3 NEWERA begitu tersedia).
  const signatureHeader = request.headers.get("x-signature") || request.headers.get("x-fr3-signature");
  const signatureValid = verifyGatewayWebhookSignature(rawBody, signatureHeader);
  if (!signatureValid && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: true }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(rawBody || "null");
  } catch {
    return NextResponse.json({ ok: true });
  }
  const raw = (body as any)?.data ?? body;
  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: true });
  const payload = parsed.data;
  const admin = createAdminClient();

  const eventKey = crypto.createHash("sha256").update(`${payload.trxId}|${payload.status}`).digest("hex");

  // === 1) Coba cocokkan ke wallet topup ===
  const { data: topup } = await admin
    .from("topups")
    .select("id, user_id, amount, status, provider, provider_order_id, provider_txn_id, payment_method, payment_amount")
    .eq("provider_txn_id", payload.trxId)
    .eq("provider", "fr3newera")
    .maybeSingle();

  if (topup) {
    if (topup.status === "APPROVED") return NextResponse.json({ ok: true, duplicate: true });

    const { data: event } = await admin.from("ppob_webhook_events").insert({
      provider: "fr3newera",
      event_key: `topup:${eventKey}`,
      payload,
      status: "RECEIVED",
    }).select("id").maybeSingle();
    if (!event) return NextResponse.json({ ok: true, duplicate: true });

    try {
      // Lapisan kedua (wajib): body webhook TIDAK pernah dipercaya begitu saja —
      // status selalu dikonfirmasi ulang lewat Check Status API pakai trxId.
      const detail = await getGatewayTransactionDetail(payload.trxId);
      const valid = detail.txn_id === payload.trxId && detail.status === "completed" && Number(detail.amount) === Number(topup.payment_amount || topup.amount);
      if (!valid) {
        await admin.from("ppob_webhook_events").update({ status: "IGNORED", error_message: "PAYMENT_NOT_CONFIRMED", processed_at: new Date().toISOString() }).eq("id", event.id);
        return NextResponse.json({ ok: true });
      }

      const { error } = await admin.rpc("confirm_gateway_topup", {
        p_topup_id: topup.id,
        p_payment_method: topup.payment_method || "qris",
        p_completed_at: detail.completed_at || new Date().toISOString(),
      });
      if (error) throw error;

      await notifyUser({
        userId: topup.user_id,
        eventKey: "TOPUP_SUCCESS",
        variables: { amount: `Rp${Number(topup.amount).toLocaleString("id-ID")}`, reference: topup.provider_order_id },
        referenceType: "topup",
        referenceId: topup.id,
        url: "/wallet/topup",
      });
      await admin.from("ppob_webhook_events").update({ status: "PROCESSED", processed_at: new Date().toISOString() }).eq("id", event.id);
      return NextResponse.json({ ok: true });
    } catch (error: any) {
      await admin.from("ppob_webhook_events").update({ status: "ERROR", error_message: String(error?.message || error), processed_at: new Date().toISOString() }).eq("id", event.id);
      console.error("FR3NEWERA TOPUP WEBHOOK ERROR:", error);
      return NextResponse.json({ ok: true });
    }
  }

  // === 2) Kalau bukan topup, coba cocokkan ke pembayaran order ===
  const { data: order } = await admin
    .from("orders")
    .select("id, status, total_amount, gateway_txn_id, user_id")
    .eq("gateway_txn_id", payload.trxId)
    .in("payment_method", ["QRIS", "BANK_VA"])
    .maybeSingle();

  if (!order || order.status !== "PENDING") return NextResponse.json({ ok: true });

  try {
    const detail = await getGatewayTransactionDetail(payload.trxId);
    if (detail.txn_id === payload.trxId && detail.status === "completed" && Number(detail.amount) === Number(order.total_amount)) {
      const { error } = await admin.rpc("confirm_gateway_payment", { p_order_id: order.id });
      if (error) {
        console.error("CONFIRM PAYMENT ERROR:", error);
      } else {
        const { data: ready } = await admin.from("ppob_transactions").select("id").eq("order_id", order.id).neq("customer_no", "pending-target").limit(1);
        if (ready?.length) await fulfillPpobOrder(order.id);
        await notifyUser({
          userId: order.user_id,
          eventKey: "TRANSACTION_SUCCESS",
          variables: { amount: `Rp${Number(order.total_amount).toLocaleString("id-ID")}`, reference: order.gateway_txn_id },
          referenceType: "order",
          referenceId: order.id,
          url: `/orders/${order.id}`,
        });
      }
    }
  } catch (e) {
    console.error("FR3NEWERA WEBHOOK VERIFY ERROR:", e);
  }

  return NextResponse.json({ ok: true });
}
