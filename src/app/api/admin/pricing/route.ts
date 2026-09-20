import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return null;
  const { data: profile } = await s.from("profiles").select("role").eq("id", user.id).single();
  return profile && ["ADMIN", "SUPER_ADMIN"].includes(profile.role) ? user : null;
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("ppob_pricing_rules").select("*").order("scope_type").order("priority", { ascending: false }).order("name");
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ rules: data || [] });
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const v = body?.value || {};
  const scope = String(v.scope_type || "GLOBAL").toUpperCase();
  const feeType = String(v.fee_type || "FIXED").toUpperCase();
  if (!["GLOBAL", "CATEGORY", "BRAND", "SKU"].includes(scope) || !["FIXED", "PERCENTAGE"].includes(feeType)) return NextResponse.json({ message: "Rule harga tidak valid." }, { status: 400 });
  const scopeKey = scope === "GLOBAL" ? "*" : String(v.scope_key || "").trim();
  if (!scopeKey) return NextResponse.json({ message: "Scope key wajib diisi." }, { status: 400 });
  const admin = createAdminClient();
  const payload = {
    ...(v.id ? { id: v.id } : {}), name: String(v.name || `Rule ${scope}`), scope_type: scope, scope_key: scopeKey,
    fee_type: feeType, fee_value: Math.max(0, Math.round(Number(v.fee_value || 0))),
    min_fee: v.min_fee === "" || v.min_fee == null ? null : Math.max(0, Math.round(Number(v.min_fee))),
    max_fee: v.max_fee === "" || v.max_fee == null ? null : Math.max(0, Math.round(Number(v.max_fee))),
    min_amount: Math.max(0, Math.round(Number(v.min_amount || 0))),
    max_amount: v.max_amount === "" || v.max_amount == null ? null : Math.max(0, Math.round(Number(v.max_amount))),
    priority: Math.round(Number(v.priority || 0)), is_active: v.is_active !== false, updated_by: user.id,
  };
  const { data, error } = await admin.from("ppob_pricing_rules").upsert(payload).select("*").single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ message: "ID rule wajib." }, { status: 400 });
  const { error } = await createAdminClient().from("ppob_pricing_rules").delete().eq("id", body.id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
