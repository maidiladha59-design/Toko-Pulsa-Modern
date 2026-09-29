import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCampaigns } from "@/lib/campaigns";

export const maxDuration = 60;

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("push_campaigns").select("*").order("key");
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: logs } = await admin.from("push_campaign_logs").select("campaign_key").gte("sent_at", since);
  const counts: Record<string, number> = {};
  for (const l of logs || []) counts[l.campaign_key] = (counts[l.campaign_key] || 0) + 1;
  return NextResponse.json({ campaigns: data || [], sent7d: counts, tableReady: !error });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);

  if (body?.action === "run") {
    try {
      const results = await runCampaigns();
      return NextResponse.json({ ok: true, results });
    } catch (e) {
      return NextResponse.json({ message: e instanceof Error ? e.message : "Gagal menjalankan kampanye." }, { status: 500 });
    }
  }

  const key = String(body?.key || "");
  const title = String(body?.title || "").trim();
  const message = String(body?.message || "").trim();
  const url = String(body?.url || "/").trim();
  const minDays = Number(body?.min_days);
  const cooldown = Number(body?.cooldown_days);
  if (!["NO_TRANSACTION", "INACTIVE"].includes(key)) return NextResponse.json({ message: "Kampanye tidak dikenal." }, { status: 400 });
  if (title.length < 2 || title.length > 120) return NextResponse.json({ message: "Judul 2–120 karakter." }, { status: 400 });
  if (message.length < 2 || message.length > 300) return NextResponse.json({ message: "Pesan 2–300 karakter." }, { status: 400 });
  if (!url.startsWith("/") || url.startsWith("//")) return NextResponse.json({ message: "Link harus diawali satu garis miring, contoh /layanan." }, { status: 400 });
  if (!Number.isInteger(minDays) || minDays < 1 || !Number.isInteger(cooldown) || cooldown < 1) {
    return NextResponse.json({ message: "Hari harus bilangan bulat minimal 1." }, { status: 400 });
  }
  const { error } = await createAdminClient().from("push_campaigns").update({
    title, message, url, min_days: minDays, cooldown_days: cooldown,
    enabled: body?.enabled === true, updated_at: new Date().toISOString(),
  }).eq("key", key);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}