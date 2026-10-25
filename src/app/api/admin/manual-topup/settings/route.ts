import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManualTopupAdmin } from "@/lib/manual-topup-admin";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  is_enabled: z.boolean(),
  min_amount: z.number().int().positive().max(1_000_000_000_000),
  max_amount: z.number().int().positive().max(1_000_000_000_000),
}).refine((value) => value.max_amount >= value.min_amount, {
  message: "Nominal maksimum harus lebih besar atau sama dengan minimum.",
});

export async function GET() {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("manual_topup_settings")
    .select("is_enabled, min_amount, max_amount, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { message: "Pengaturan Top Up Manual belum tersedia. Pastikan migrasi v93 sudah dijalankan." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    settings: data ?? { is_enabled: false, min_amount: 10000, max_amount: 5000000 },
  });
}

export async function PUT(request: Request) {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Pengaturan Top Up Manual tidak valid." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("manual_topup_settings")
    .update({
      is_enabled: parsed.data.is_enabled,
      min_amount: parsed.data.min_amount,
      max_amount: parsed.data.max_amount,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    })
    .eq("id", 1)
    .select("is_enabled, min_amount, max_amount, updated_at")
    .single();

  if (error || !data) {
    console.error("[manual-topup-admin] gagal menyimpan pengaturan", JSON.stringify({ code: error?.code ?? null }));
    return NextResponse.json({ message: "Gagal menyimpan pengaturan. Silakan coba lagi." }, { status: 500 });
  }

  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: "manual_topup.settings_update",
    target_type: "manual_topup_settings",
    target_id: null,
    metadata: {
      is_enabled: data.is_enabled,
      min_amount: data.min_amount,
      max_amount: data.max_amount,
    },
  });

  return NextResponse.json({ ok: true, settings: data });
}
