import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ refund_id: z.string().uuid() });
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "refund_id tidak valid" }, { status: 400 });
  const admin = createAdminClient();
  const { data: refund } = await admin.from("refunds").select("id,order_id,status,reason").eq("id", parsed.data.refund_id).single();
  if (!refund) return NextResponse.json({ message: "Refund tidak ditemukan" }, { status: 404 });
  if (refund.status !== "FAILED") return NextResponse.json({ message: `Refund berstatus ${refund.status}; hanya FAILED yang dapat di-retry.` }, { status: 409 });
  const { data, error } = await admin.rpc("create_system_refund", { p_order_id: refund.order_id, p_reason: refund.reason });
  if (error) return NextResponse.json({ message: "Retry refund gagal.", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, refund_id: data, message: "Refund diproses ulang dengan guard idempotensi." });
}
