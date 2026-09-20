import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const [recon, refunds] = await Promise.all([
    admin.from("payment_reconciliation").select("*").order("checked_at", { ascending: false }).limit(500),
    admin.from("refunds").select("id,order_id,user_id,amount,reason,status,source,processed_at,created_at,updated_at").order("created_at", { ascending: false }).limit(500),
  ]);
  if (recon.error || refunds.error) return NextResponse.json({ message: "Migration v40 belum diterapkan." }, { status: 503 });
  const rows = recon.data || [];
  return NextResponse.json({
    reconciliation: rows,
    refunds: refunds.data || [],
    summary: { matched: rows.filter(r=>r.state==='MATCHED').length, mismatches: rows.filter(r=>r.state!=='MATCHED').length, refunds: (refunds.data||[]).length }
  });
}
