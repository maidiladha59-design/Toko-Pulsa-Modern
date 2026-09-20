import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const { data, error } = await createAdminClient().from("maintenance_settings").select("*").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function POST(req: Request) {
  const user = await getAdmin();
  if (!user) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ message: "Data tidak valid" }, { status: 400 });

  const enabled = Boolean((body as any).enabled);
  const title = String((body as any).title || "AIDIL STORE sedang dalam pemeliharaan").trim().slice(0, 160);
  const message = String((body as any).message || "Kami sedang melakukan perbaikan dan peningkatan sistem. Silakan coba kembali beberapa saat lagi.").trim().slice(0, 1000);
  const rawStarts = (body as any).starts_at;
  const rawEnds = (body as any).ends_at;
  const startsAt = rawStarts ? new Date(rawStarts) : null;
  const endsAt = rawEnds ? new Date(rawEnds) : null;
  if (!title || !message) return NextResponse.json({ message: "Judul dan pesan wajib diisi" }, { status: 400 });
  if (startsAt && Number.isNaN(startsAt.getTime())) return NextResponse.json({ message: "Waktu mulai tidak valid" }, { status: 400 });
  if (endsAt && Number.isNaN(endsAt.getTime())) return NextResponse.json({ message: "Waktu selesai tidak valid" }, { status: 400 });
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) return NextResponse.json({ message: "Waktu selesai harus setelah waktu mulai" }, { status: 400 });

  const enabledValue = {
    id: 1,
    enabled,
    title,
    message,
    starts_at: startsAt ? startsAt.toISOString() : null,
    ends_at: endsAt ? endsAt.toISOString() : null,
    allow_admin_bypass: (body as any).allow_admin_bypass !== false,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  const { error } = await admin.from("maintenance_settings").upsert(enabledValue, { onConflict: "id" });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: enabled ? "maintenance.enabled" : "maintenance.disabled",
    target_type: "maintenance_settings",
    metadata: { title, starts_at: enabledValue.starts_at, ends_at: enabledValue.ends_at, allow_admin_bypass: enabledValue.allow_admin_bypass },
  });
  return NextResponse.json({ ok: true, settings: enabledValue });
}
