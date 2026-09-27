import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURES } from "@/lib/features";

async function getAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) return null;
  return user;
}

export async function GET() {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const { data, error } = await createAdminClient().from("feature_flags").select("key, enabled, updated_at");
  const rows = new Map((data || []).map((r) => [r.key, r]));
  const features = FEATURES.map((f) => ({
    ...f,
    enabled: rows.get(f.key)?.enabled ?? true,
    updated_at: rows.get(f.key)?.updated_at ?? null,
  }));
  return NextResponse.json({ features, tableReady: !error });
}

export async function POST(req: Request) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const key = String(body?.key || "");
  if (!FEATURES.some((f) => f.key === key) || typeof body?.enabled !== "boolean") {
    return NextResponse.json({ message: "Data tidak valid" }, { status: 400 });
  }
  const { error } = await createAdminClient().from("feature_flags").upsert(
    { key, enabled: body.enabled, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, key, enabled: body.enabled });
}