import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  enabled: z.boolean(),
  fee_type: z.enum(["FIXED", "PERCENTAGE"]),
  fee_value: z.number().finite().min(0).max(1000000),
  min_transfer: z.number().int().min(1000).max(100000000),
  max_transfer: z.number().int().min(1000).max(1000000000),
  daily_limit: z.number().int().min(1000).max(100000000000),
  monthly_limit: z.number().int().min(1000).max(1000000000000),
}).refine((v) => v.max_transfer >= v.min_transfer, { message: "Maksimal transfer harus >= minimal transfer." })
  .refine((v) => v.monthly_limit >= v.daily_limit, { message: "Limit bulanan harus >= limit harian." });

async function requireAdmin() {
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(profile.role)) return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("transfer_settings")
    .select("enabled, fee_type, fee_value, min_transfer, max_transfer, daily_limit, monthly_limit, updated_at")
    .eq("id", 1)
    .single();
  if (error || !data) return NextResponse.json({ message: "Gagal membaca pengaturan transfer." }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Pengaturan tidak valid." }, { status: 400 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("transfer_settings")
    .update({ ...parsed.data, updated_by: auth.user.id, updated_at: now })
    .eq("id", 1)
    .select("enabled, fee_type, fee_value, min_transfer, max_transfer, daily_limit, monthly_limit, updated_at")
    .single();
  if (error || !data) return NextResponse.json({ message: "Gagal menyimpan pengaturan transfer." }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: "transfer.settings_update",
    target_type: "transfer_settings",
    target_id: "1",
    metadata: parsed.data,
  });

  return NextResponse.json(data);
}
