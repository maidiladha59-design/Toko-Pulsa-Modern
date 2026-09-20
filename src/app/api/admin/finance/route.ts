import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function rangeFor(period: string, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  if (period === "week") start.setDate(start.getDate() - 6);
  else if (period === "month") start.setDate(start.getDate() - 29);
  else start.setDate(start.getDate() - 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function sum(rows: any[], key: string) { return rows.reduce((n, r) => n + Number(r[key] || 0), 0); }

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "month";
  const { start, end } = rangeFor(period);
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("financial_ledger").select("id,event_type,source_type,source_id,user_id,gross_amount,provider_cost,gateway_cost,fee_revenue,net_profit,metadata,occurred_at").gte("occurred_at", start).lte("occurred_at", end).order("occurred_at", { ascending: false }).limit(10000);
  if (error) return NextResponse.json({ message: "Financial ledger belum tersedia. Jalankan migration v38." }, { status: 503 });
  const data = rows || [];
  const byType = (type: string) => data.filter(r => r.event_type === type);
  const summary = {
    gross_sales: sum(data, "gross_amount"),
    provider_cost: sum(data, "provider_cost"),
    gateway_cost: sum(data, "gateway_cost"),
    fee_revenue: sum(data, "fee_revenue"),
    net_profit: sum(data, "net_profit"),
    transactions: data.filter(r => r.event_type !== "ORDER_REFUND").length,
    orders: byType("ORDER_SALE").length,
    refunds: byType("ORDER_REFUND").length,
    topups: byType("TOPUP_FEE").length,
    topup_fees: sum(byType("TOPUP_FEE"), "fee_revenue"),
  };
  const dailyMap = new Map<string, any>();
  for (const r of data) {
    const d = new Date(r.occurred_at).toISOString().slice(0, 10);
    const x = dailyMap.get(d) || { date: d, gross: 0, provider: 0, gateway: 0, fees: 0, profit: 0, transactions: 0 };
    x.gross += Number(r.gross_amount || 0); x.provider += Number(r.provider_cost || 0); x.gateway += Number(r.gateway_cost || 0); x.fees += Number(r.fee_revenue || 0); x.profit += Number(r.net_profit || 0); x.transactions += r.event_type === "ORDER_REFUND" ? 0 : 1;
    dailyMap.set(d, x);
  }
  return NextResponse.json({ period, start, end, summary, daily: [...dailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)), rows: data });
}
