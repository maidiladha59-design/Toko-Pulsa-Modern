import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notification-engine";

const schema = z.object({ status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"]), note: z.string().max(500).optional() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login kembali." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Status order tidak valid." }, { status: 400 });
  const { error } = await supabase.rpc("admin_update_order_status", { p_order_id: params.id, p_status: parsed.data.status, p_admin_id: user.id, p_note: parsed.data.note || null });
  if (error) {
    const m = error.message || "";
    if (m.includes("ORDER_NOT_FOUND")) return NextResponse.json({ message: "Order tidak ditemukan." }, { status: 404 });
    if (m.includes("ORDER_ALREADY_REFUNDED")) return NextResponse.json({ message: "Order sudah direfund." }, { status: 409 });
    if (m.includes("ORDER_NOT_PAID")) return NextResponse.json({ message: "Order ini belum dibayar, tidak bisa direfund." }, { status: 409 });
    if (m.includes("WALLET_NOT_FOUND")) return NextResponse.json({ message: "Wallet pengguna tidak ditemukan." }, { status: 500 });
    if (m.includes("ADMIN_ONLY")) return NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 });
    console.error("ADMIN ORDER STATUS ERROR:", error);
    return NextResponse.json({ message: `Gagal mengubah status order: ${m || "error database"}` }, { status: 500 });
  }
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("user_id,total_amount").eq("id", params.id).maybeSingle();
  if (order) {
    if (parsed.data.status === "COMPLETED") await notifyUser({ userId: order.user_id, eventKey: "TRANSACTION_SUCCESS", variables: { amount: `Rp${Number(order.total_amount).toLocaleString("id-ID")}`, reference: params.id }, referenceType: "order", referenceId: params.id, url: `/orders/${params.id}` });
    if (["FAILED", "CANCELLED", "REFUNDED"].includes(parsed.data.status)) await notifyUser({ userId: order.user_id, eventKey: "TRANSACTION_FAILED", variables: { amount: `Rp${Number(order.total_amount).toLocaleString("id-ID")}`, reference: params.id }, referenceType: "order", referenceId: params.id, url: `/orders/${params.id}` });
  }
  return NextResponse.json({ message: `Status order diubah menjadi ${parsed.data.status}.` });
}