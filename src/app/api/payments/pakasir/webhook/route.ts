import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPakasirTransactionDetail, isPakasirConfigured } from "@/lib/pakasir";
import { fulfillPpobOrder } from "@/lib/ppob/fulfill";
import { notifyUser } from "@/lib/notification-engine";

const webhookSchema = z.object({
  amount: z.number(), order_id: z.string(), project: z.string(), status: z.string(),
  payment_method: z.string().optional(), completed_at: z.string().optional(),
});

export async function POST(request: Request) {
  if (!isPakasirConfigured()) return NextResponse.json({ ok: true });

  const rawBody = await request.text();
  let body: unknown = null;
  try { body = JSON.parse(rawBody || "null"); } catch { return NextResponse.json({ ok: true }); }
  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });
  const payload = parsed.data;
  const admin = createAdminClient();

  // Pakasir documents webhook delivery without an HMAC signature. We therefore
  // use the project/order/amount checks below and re-query Transaction Detail.
  const eventKey = crypto.createHash("sha256").update(`${payload.project}|${payload.order_id}|${payload.amount}|${payload.status}|${payload.completed_at || ""}`).digest("hex");

  // TOPUP webhook path: same Pakasir webhook URL can safely handle both orders and wallet deposits.
  if (payload.order_id.startsWith("TOPUP-")) {
    const { data: topup } = await admin
      .from("topups")
      .select("id, user_id, amount, status, provider, provider_order_id, payment_method, gateway_total_payment, payment_amount, webhook_event_key")
      .eq("provider_order_id", payload.order_id)
      .maybeSingle();

    if (!topup || topup.provider !== "pakasir" || Number(topup.payment_amount || topup.amount) !== Number(payload.amount)) return NextResponse.json({ ok: true });
    if (topup.status === "APPROVED") return NextResponse.json({ ok: true, duplicate: true });

    const { data: event } = await admin.from("ppob_webhook_events").insert({
      provider: "pakasir",
      event_key: `topup:${eventKey}`,
      payload: payload,
      status: "RECEIVED",
    }).select("id").maybeSingle();

    if (!event) return NextResponse.json({ ok: true, duplicate: true });

    try {
      const detail = await getPakasirTransactionDetail(payload.order_id, Number(topup.payment_amount || topup.amount));
      const valid = detail.project === payload.project && detail.order_id === payload.order_id && detail.status === "completed" && Number(detail.amount) === Number(topup.payment_amount || topup.amount);
      if (!valid) {
        await admin.from("ppob_webhook_events").update({ status: "IGNORED", error_message: "PAYMENT_NOT_CONFIRMED", processed_at: new Date().toISOString() }).eq("id", event.id);
        return NextResponse.json({ ok: true });
      }

      const { error } = await admin.rpc("confirm_pakasir_topup", {
        p_topup_id: topup.id,
        p_payment_method: detail.payment_method || payload.payment_method || topup.payment_method || "unknown",
        p_completed_at: detail.completed_at || payload.completed_at || new Date().toISOString(),
      });
      if (error) throw error;
      await notifyUser({ userId: topup.user_id, eventKey: "TOPUP_SUCCESS", variables: { amount: `Rp${Number(topup.amount).toLocaleString("id-ID")}`, reference: topup.provider_order_id }, referenceType: "topup", referenceId: topup.id, url: "/topup/history" });

      await admin.from("ppob_webhook_events").update({ status: "PROCESSED", processed_at: new Date().toISOString() }).eq("id", event.id);
      return NextResponse.json({ ok: true });
    } catch (error: any) {
      await admin.from("ppob_webhook_events").update({ status: "ERROR", error_message: String(error?.message || error), processed_at: new Date().toISOString() }).eq("id", event.id);
      console.error("PAKASIR TOPUP WEBHOOK ERROR:", error);
      return NextResponse.json({ ok: true });
    }
  }

  // Existing order payment path.
  const { data: order } = await admin
    .from("orders")
    .select("id, status, payment_method, gateway_method, total_amount, gateway_reference")
    .eq("gateway_reference", payload.order_id)
    .in("payment_method", ["QRIS", "BANK_VA"])
    .maybeSingle();

  if (!order || order.status !== "PENDING") return NextResponse.json({ ok: true });

  try {
    const detail = await getPakasirTransactionDetail(payload.order_id, order.total_amount);
    if (detail.project === process.env.PAKASIR_PROJECT && detail.order_id === payload.order_id && detail.status === "completed" && Number(detail.amount) === Number(order.total_amount) && Number(payload.amount) === Number(order.total_amount)) {
      const { error } = await admin.rpc("confirm_gateway_payment", { p_order_id: order.id });
      if (error) console.error("CONFIRM PAYMENT ERROR:", error);
      else {
        const { data: ready } = await admin.from("ppob_transactions").select("id").eq("order_id", order.id).neq("customer_no", "pending-target").limit(1);
        if (ready?.length) await fulfillPpobOrder(order.id);
        const { data: orderUser } = await admin.from("orders").select("user_id").eq("id", order.id).single();
        if (orderUser) await notifyUser({ userId: orderUser.user_id, eventKey: "TRANSACTION_SUCCESS", variables: { amount: `Rp${Number(order.total_amount).toLocaleString("id-ID")}`, reference: order.id }, referenceType: "order", referenceId: order.id, url: `/orders/${order.id}` });
      }
    }
  } catch (e) { console.error("PAKASIR WEBHOOK VERIFY ERROR:", e); }

  return NextResponse.json({ ok: true });
}
