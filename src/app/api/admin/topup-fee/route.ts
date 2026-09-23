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

// Sejak v36, tarif yang benar-benar dipakai saat checkout ("/api/topup") diambil dari
// tabel per-metode `topup_fee_methods` (grup "qris"), bukan dari `topup_fee_settings`.
// Panel admin ini dulu hanya menulis ke `topup_fee_settings`, sehingga perubahan yang
// disimpan admin tidak pernah terbaca oleh halaman Top Up (selalu tampil Rp 0).
// Perbaikan: baca & tulis kedua tabel sekaligus — `topup_fee_methods` (grup qris) untuk
// enabled/fee_type/fee_value/min_topup/max_topup, dan `topup_fee_settings` untuk deadline_minutes
// (kolom ini hanya ada di topup_fee_settings).
const FEE_GROUP = "qris";

export async function GET() {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const admin = createAdminClient();
  const [methodRes, settingsRes] = await Promise.all([
    admin.from("topup_fee_methods").select("enabled, fee_type, fee_value, min_topup, max_topup, updated_at").eq("payment_group", FEE_GROUP).single(),
    admin.from("topup_fee_settings").select("deadline_minutes").eq("id", 1).single(),
  ]);
  if (methodRes.error || settingsRes.error) return NextResponse.json({ message: "Gagal membaca pengaturan biaya Top Up." }, { status: 500 });
  const { enabled, fee_type, fee_value, min_topup, max_topup, updated_at } = methodRes.data;
  return NextResponse.json({ enabled, fee_type, fee_value, min_topup, max_topup, deadline_minutes: settingsRes.data.deadline_minutes, updated_at });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(); if (auth.error) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Pengaturan tidak valid." }, { status: 400 });
  const { deadline_minutes, ...methodFields } = parsed.data;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: methodData, error: methodError } = await admin.from("topup_fee_methods")
    .update({ ...methodFields, updated_by: auth.user.id, updated_at: now })
    .eq("payment_group", FEE_GROUP)
    .select("enabled, fee_type, fee_value, min_topup, max_topup, updated_at")
    .single();
  if (methodError || !methodData) return NextResponse.json({ message: "Gagal menyimpan pengaturan biaya Top Up." }, { status: 500 });

  const { error: settingsError } = await admin.from("topup_fee_settings")
    .upsert({ id: 1, ...parsed.data, updated_by: auth.user.id, updated_at: now });
  if (settingsError) return NextResponse.json({ message: "Gagal menyimpan batas waktu pembayaran." }, { status: 500 });

  await admin.from("audit_logs").insert({ actor_id: auth.user.id, action: "topup.fee_settings_update", target_type: "topup_fee_methods", target_id: FEE_GROUP, metadata: parsed.data });
  return NextResponse.json({ ...methodData, deadline_minutes });
}