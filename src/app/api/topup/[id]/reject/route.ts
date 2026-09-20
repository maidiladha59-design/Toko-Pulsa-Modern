import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notification-engine";

const rejectSchema = z.object({
  reason: z.string().min(3, "Alasan penolakan minimal 3 karakter.").max(500, "Alasan penolakan terlalu panjang."),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ message: "Anda harus login terlebih dahulu." }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return NextResponse.json({ message: "Anda tidak memiliki akses untuk menolak Top Up." }, { status: 403 });

    const parsed = rejectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data penolakan tidak valid." }, { status: 400 });

    const admin = createAdminClient();
    const { data: currentTopup, error: fetchError } = await admin.from("topups").select("id,user_id,amount,status,provider_order_id").eq("id", params.id).single();
    if (fetchError || !currentTopup) return NextResponse.json({ message: "Data Top Up tidak ditemukan." }, { status: 404 });
    if (!["PENDING", "VERIFYING"].includes(currentTopup.status)) return NextResponse.json({ message: "Transaksi ini sudah diproses sebelumnya." }, { status: 409 });

    const { data: updatedTopup, error: updateError } = await admin.from("topups").update({ status:"REJECTED", rejection_reason:parsed.data.reason, reviewed_by:user.id, reviewed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq("id",params.id).in("status",["PENDING","VERIFYING"]).select("id,user_id,amount,status,provider_order_id").single();
    if (updateError || !updatedTopup) return NextResponse.json({ message:"Gagal menolak Top Up. Silakan coba lagi." }, { status:500 });

    await admin.from("audit_logs").insert({ actor_id:user.id, action:"topup.reject", target_type:"topup", target_id:params.id, metadata:{ reason:parsed.data.reason } });
    await notifyUser({ userId:updatedTopup.user_id, eventKey:"TOPUP_FAILED", variables:{ amount:`Rp${Number(updatedTopup.amount).toLocaleString("id-ID")}`, reference:updatedTopup.provider_order_id || params.id }, referenceType:"topup", referenceId:params.id, url:"/wallet/topup" });

    return NextResponse.json({ success:true, message:"Top Up berhasil ditolak.", topup:updatedTopup });
  } catch (error) {
    console.error("Reject topup unexpected error:", error);
    return NextResponse.json({ message:"Terjadi kesalahan pada server." }, { status:500 });
  }
}
