import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGatewayTransactionDetail, isGatewayConfigured, isGatewayFailedStatus } from "@/lib/fr3newera";
import { fulfillPpobOrder } from "@/lib/ppob/fulfill";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });

  const { data: order } = await supabase
    .from("orders")
    .select("id, user_id, status, payment_method, gateway_reference, gateway_txn_id, gateway_method, total_amount, qris_expired_at")
    .eq("id", params.id)
    .single();

  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ message: "Order tidak ditemukan." }, { status: 404 });
  }

  if (!["QRIS", "BANK_VA"].includes(order.payment_method) || order.status !== "PENDING") {
    return NextResponse.json({ status: order.status });
  }

  const admin = createAdminClient();

  // FR3 NEWERA memeriksa status lewat trxId (orders.gateway_txn_id) — FR3 tidak
  // mengenal konsep order_id, jadi pencocokannya hanya trxId + nominal. Order
  // lama tanpa gateway_txn_id tidak bisa dicek; statusnya diselesaikan oleh
  // webhook atau kedaluwarsa.
  if (isGatewayConfigured() && order.gateway_txn_id) {
  try {
    const detail = await getGatewayTransactionDetail(order.gateway_txn_id);

    if (
      detail.status === "completed" &&
      detail.txn_id === order.gateway_txn_id &&
      Number(detail.amount) === Number(order.total_amount)
    ) {
      const { error } = await admin.rpc("confirm_gateway_payment", { p_order_id: order.id });
      if (error) console.error("CONFIRM GATEWAY PAYMENT ERROR:", error);
      else {
        // Bila webhook terlewat, fulfillment PPOB tetap harus jalan (klaim atomik
        // mencegah pengiriman ganda ke provider).
        try { await fulfillPpobOrder(order.id); } catch (e) { console.error("PPOB FULFILL (STATUS POLL) ERROR:", e); }
      }

      const { data: refreshed } = await admin
        .from("orders")
        .select("status")
        .eq("id", order.id)
        .single();

      return NextResponse.json({ status: refreshed?.status || "PROCESSING" });
    }

    if (isGatewayFailedStatus(detail.status)) {
      await admin.from("orders")
        .update({ status: "FAILED", updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("status", "PENDING");
      return NextResponse.json({ status: "FAILED" });
    }
  } catch (error) {
    console.error("PAYMENT STATUS CHECK ERROR:", error);
  }
  }

  if (order.qris_expired_at && new Date(order.qris_expired_at).getTime() < Date.now()) {
    await admin.from("orders")
      .update({ status: "FAILED", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "PENDING");
    return NextResponse.json({ status: "FAILED" });
  }

  return NextResponse.json({ status: "PENDING" });
}
