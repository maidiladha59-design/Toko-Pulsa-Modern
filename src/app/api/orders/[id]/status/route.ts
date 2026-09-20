import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPakasirTransactionDetail, isPakasirConfigured } from "@/lib/pakasir";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });

  const { data: order } = await supabase
    .from("orders")
    .select("id, user_id, status, payment_method, gateway_reference, gateway_method, total_amount, qris_expired_at")
    .eq("id", params.id)
    .single();

  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ message: "Order tidak ditemukan." }, { status: 404 });
  }

  if (!["QRIS", "BANK_VA"].includes(order.payment_method) || order.status !== "PENDING") {
    return NextResponse.json({ status: order.status });
  }

  if (!isPakasirConfigured() || !order.gateway_reference) {
    return NextResponse.json({ status: order.status });
  }

  const admin = createAdminClient();

  try {
    const detail = await getPakasirTransactionDetail(order.gateway_reference, order.total_amount);

    if (
      detail.status === "completed" &&
      Number(detail.amount) === Number(order.total_amount)
    ) {
      const { error } = await admin.rpc("confirm_gateway_payment", { p_order_id: order.id });
      if (error) console.error("CONFIRM GATEWAY PAYMENT ERROR:", error);

      const { data: refreshed } = await admin
        .from("orders")
        .select("status")
        .eq("id", order.id)
        .single();

      return NextResponse.json({ status: refreshed?.status || "PROCESSING" });
    }

    if (detail.status === "expired" || detail.status === "cancelled") {
      await admin.from("orders")
        .update({ status: "FAILED", updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("status", "PENDING");
      return NextResponse.json({ status: "FAILED" });
    }
  } catch (error) {
    console.error("PAYMENT STATUS CHECK ERROR:", error);
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
