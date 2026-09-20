import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPrepaidPriceList } from "@/lib/ppob/digiflazz";

async function guard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return { response: NextResponse.json({ message: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await guard();
  if ("response" in auth) return auth.response;
  const admin = createAdminClient();
  const [{ count: total }, { count: active }, { data: lastSync }, { count: processing }] = await Promise.all([
    admin.from("ppob_services").select("id", { count: "exact", head: true }),
    admin.from("ppob_services").select("id", { count: "exact", head: true }).eq("provider_active", true),
    admin.from("ppob_provider_syncs").select("status,started_at,finished_at,fetched,created_count,updated_count,skipped_count,error_message").eq("provider", "digiflazz").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("ppob_transactions").select("id", { count: "exact", head: true }).eq("status", "PROCESSING"),
  ]);
  return NextResponse.json({
    provider: "digiflazz",
    configured: Boolean(process.env.DIGIFLAZZ_USERNAME && process.env.DIGIFLAZZ_API_KEY),
    testing: process.env.DIGIFLAZZ_TESTING === "true",
    services: { total: total || 0, active: active || 0, inactive: Math.max(0, (total || 0) - (active || 0)) },
    processing: processing || 0,
    lastSync: lastSync || null,
  });
}

export async function POST() {
  const auth = await guard();
  if ("response" in auth) return auth.response;
  const started = Date.now();
  try {
    const result = await getPrepaidPriceList();
    const count = Array.isArray(result.data) ? result.data.length : 0;
    return NextResponse.json({ ok: true, provider: "digiflazz", latencyMs: Date.now() - started, prepaidSkuCount: count, checkedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ ok: false, provider: "digiflazz", latencyMs: Date.now() - started, message: error?.message || "Provider check gagal." }, { status: 502 });
  }
}
