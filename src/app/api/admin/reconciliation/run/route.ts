import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPakasirTransactionDetail, isPakasirConfigured } from "@/lib/pakasir";

async function isAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401 as const };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { ok: Boolean(profile && ["ADMIN", "SUPER_ADMIN"].includes(profile.role)), status: 403 as const };
}

export async function POST() {
  const auth = await isAdmin();
  if (!auth.ok) return NextResponse.json({ message: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  const admin = createAdminClient();
  const checked: any[] = [];
  const errors: any[] = [];

  const { data: topups } = await admin.from("topups").select("id,amount,payment_amount,status,provider,provider_order_id,payment_method").eq("provider","pakasir").order("created_at", { ascending: false }).limit(100);
  for (const t of topups || []) {
    try {
      let provider: any = null;
      if (isPakasirConfigured() && ["PENDING","VERIFYING"].includes(t.status) && t.provider_order_id && t.payment_amount) {
        provider = await getPakasirTransactionDetail(t.provider_order_id, Number(t.payment_amount));
        const { data: internal } = await admin.rpc("reconcile_internal_financial_record", { p_source_type: "TOPUP", p_source_id: t.id });
        await admin.from("payment_reconciliation").upsert({
          source_type: "TOPUP", source_id: t.id, provider: "pakasir", internal_status: t.status,
          provider_status: provider.status, internal_amount: Number(t.payment_amount), provider_amount: Number(provider.amount),
          state: internal?.state || "REVIEW",
          discrepancy: internal?.discrepancy || (provider.status === "completed" && t.status !== "APPROVED" ? "Pakasir completed tetapi Top Up belum APPROVED" : null),
          wallet_amount: internal?.wallet_amount ?? null,
          checked_at: new Date().toISOString(), metadata: { runner: "v40.1", payment_method: t.payment_method }
        }, { onConflict: "source_type,source_id" });
      } else {
        const { data } = await admin.rpc("reconcile_internal_financial_record", { p_source_type: "TOPUP", p_source_id: t.id });
        provider = data;
      }
      checked.push({ source_type: "TOPUP", source_id: t.id, provider });
    } catch (e: any) { errors.push({ source_type: "TOPUP", source_id: t.id, message: String(e?.message || e) }); }
  }

  const { data: orders } = await admin.from("orders").select("id,order_number,total_amount,status,payment_method,gateway_method,gateway_reference,paid_at").in("payment_method", ["QRIS","BANK_VA"]).order("created_at", { ascending: false }).limit(100);
  for (const o of orders || []) {
    try {
      if (isPakasirConfigured() && ["PENDING","PROCESSING"].includes(o.status) && o.gateway_reference) {
        const provider = await getPakasirTransactionDetail(o.gateway_reference, Number(o.total_amount));
        const { data: internal } = await admin.rpc("reconcile_internal_financial_record", { p_source_type: "ORDER", p_source_id: o.id });
        await admin.from("payment_reconciliation").upsert({
          source_type: "ORDER", source_id: o.id, provider: "pakasir", internal_status: o.status, provider_status: provider.status,
          internal_amount: Number(o.total_amount), provider_amount: Number(provider.amount), state: internal?.state || "REVIEW",
          wallet_amount: internal?.wallet_amount ?? null,
          discrepancy: internal?.discrepancy || (provider.status === "completed" && o.status === "FAILED" ? "Pakasir completed tetapi order FAILED" : null),
          checked_at: new Date().toISOString(), metadata: { runner: "v40.1", order_number: o.order_number, gateway_method: o.gateway_method }
        }, { onConflict: "source_type,source_id" });
      } else await admin.rpc("reconcile_internal_financial_record", { p_source_type: "ORDER", p_source_id: o.id });
      checked.push({ source_type: "ORDER", source_id: o.id });
    } catch (e: any) { errors.push({ source_type: "ORDER", source_id: o.id, message: String(e?.message || e) }); }
  }

  const { data: ppob } = await admin.from("ppob_transactions").select("id").in("status", ["WAITING","PROCESSING","SUCCESS","FAILED","REFUNDED"]).order("created_at", { ascending: false }).limit(200);
  for (const p of ppob || []) {
    try {
      await admin.rpc("reconcile_internal_financial_record", { p_source_type: "PPOB", p_source_id: p.id });
      checked.push({ source_type: "PPOB", source_id: p.id });
    } catch (e: any) { errors.push({ source_type: "PPOB", source_id: p.id, message: String(e?.message || e) }); }
  }

  return NextResponse.json({ ok: true, checked_count: checked.length, error_count: errors.length, errors });
}
