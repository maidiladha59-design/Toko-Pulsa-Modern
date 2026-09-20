import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  enabled: z.boolean(), fee_type: z.enum(["FIXED", "PERCENTAGE"]), fee_value: z.number().finite().min(0).max(1000000),
  min_topup: z.number().int().min(1000).max(10000000), max_topup: z.number().int().min(1000).max(10000000),
  deadline_minutes: z.number().int().min(5).max(1440),
}).refine((v) => v.max_topup >= v.min_topup, { message: "Maksimal Top Up harus >= minimal Top Up." });

async function requireAdmin() {
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const { data, error } = await createAdminClient().from("topup_fee_settings").select("enabled, fee_type, fee_value, min_topup, max_topup, deadline_minutes, updated_at").eq("id", 1).single();
  if (error) return NextResponse.json({ message: "Gagal membaca pengaturan biaya Top Up." }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Pengaturan tidak valid." }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("topup_fee_settings").upsert({ id: 1, ...parsed.data, updated_by: auth.user.id, updated_at: new Date().toISOString() }).select("enabled, fee_type, fee_value, min_topup, max_topup, deadline_minutes, updated_at").single();
  if (error) return NextResponse.json({ message: "Gagal menyimpan pengaturan biaya Top Up." }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_id: auth.user.id, action: "topup.fee_settings_update", target_type: "topup_fee_settings", target_id: null, metadata: parsed.data });
  return NextResponse.json(data);
}
