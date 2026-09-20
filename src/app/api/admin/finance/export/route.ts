import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function csvCell(value: unknown) { const s = value == null ? "" : String(value); return `"${s.replaceAll('"','""')}"`; }
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN","SUPER_ADMIN"].includes(profile.role)) return new NextResponse("Forbidden", { status: 403 });
  const url = new URL(request.url); const from = url.searchParams.get("from"); const to = url.searchParams.get("to");
  const admin = createAdminClient();
  let q = admin.from("financial_ledger").select("event_type,source_type,source_id,user_id,gross_amount,provider_cost,gateway_cost,fee_revenue,net_profit,metadata,occurred_at").order("occurred_at", { ascending: false }).limit(50000);
  if (from) q = q.gte("occurred_at", new Date(`${from}T00:00:00`).toISOString());
  if (to) q = q.lte("occurred_at", new Date(`${to}T23:59:59.999`).toISOString());
  const { data, error } = await q;
  if (error) return new NextResponse("Financial ledger belum tersedia.", { status: 503 });
  const header = ["tanggal","jenis","sumber","id_sumber","user_id","gross_amount","provider_cost","gateway_cost","fee_revenue","net_profit","metadata"];
  const lines = [header.map(csvCell).join(","), ...(data || []).map(r => [r.occurred_at,r.event_type,r.source_type,r.source_id,r.user_id,r.gross_amount,r.provider_cost,r.gateway_cost,r.fee_revenue,r.net_profit,JSON.stringify(r.metadata||{})].map(csvCell).join(","))];
  return new NextResponse("\uFEFF" + lines.join("\n"), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="aidil-store-financial-report-${from||"all"}-${to||"all"}.csv"` } });
}
