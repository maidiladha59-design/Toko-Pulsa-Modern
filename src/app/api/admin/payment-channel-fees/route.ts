import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateTopupFee, toChannelFeeInput } from "@/lib/topup-fee";

const feeType = z.enum(["flat", "percent", "flat_percent"]);

const channelSchema = z.object({
  channel_code: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(120),
  channel_group: z.string().trim().min(1).max(60),
  is_active: z.boolean(),
  gateway_fee_type: feeType,
  gateway_fee_flat: z.number().int().min(0).max(100000000),
  gateway_fee_percent: z.number().min(0).max(100),
  gateway_fee_tax_percent: z.number().min(0).max(100),
  margin_type: feeType,
  margin_flat: z.number().int().min(0).max(100000000),
  margin_percent: z.number().min(0).max(100),
  min_amount: z.number().int().min(0).max(1000000000).nullable().optional(),
  max_amount: z.number().int().min(0).max(1000000000).nullable().optional(),
  customer_note: z.string().trim().max(500).nullable().optional(),
}).refine((v) => v.min_amount == null || v.max_amount == null || v.min_amount <= v.max_amount, { message: "Batas bawah nominal harus <= batas atas." });

// STAFF boleh melihat & mensimulasikan; hanya ADMIN/SUPER_ADMIN boleh mengubah.
async function requireAdmin(allowStaff: boolean) {
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const roles = allowStaff ? ["ADMIN", "SUPER_ADMIN", "STAFF"] : ["ADMIN", "SUPER_ADMIN"];
  if (!profile || !roles.includes(profile.role)) return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const auth = await requireAdmin(true); if (auth.error) return auth.error;
  const admin = createAdminClient();
  const { data, error } = await admin.from("payment_channel_fees").select("*").order("channel_group", { ascending: true }).order("channel_code", { ascending: true });
  if (error) return NextResponse.json({ message: "Gagal membaca daftar biaya channel. Pastikan migration v85 sudah dijalankan." }, { status: 500 });
  return NextResponse.json({ channels: data ?? [] });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(false); if (auth.error) return auth.error;
  const parsed = channelSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data channel tidak valid." }, { status: 400 });
  const { channel_code, label, channel_group, is_active, gateway_fee_type, gateway_fee_flat, gateway_fee_percent, gateway_fee_tax_percent, margin_type, margin_flat, margin_percent } = parsed.data;
  const min_amount = parsed.data.min_amount ?? null;
  const max_amount = parsed.data.max_amount ?? null;
  const customer_note = parsed.data.customer_note?.trim() ? parsed.data.customer_note.trim() : null;

  const admin = createAdminClient();
  const { data: before } = await admin.from("payment_channel_fees").select("*").eq("channel_code", channel_code).maybeSingle();
  if (!before) return NextResponse.json({ message: "Channel tidak ditemukan. Channel dibuat lewat migration, bukan panel admin." }, { status: 404 });

  const payload = { label, channel_group, is_active, gateway_fee_type, gateway_fee_flat, gateway_fee_percent, gateway_fee_tax_percent, margin_type, margin_flat, margin_percent, min_amount, max_amount, customer_note, updated_by: auth.user.id, updated_at: new Date().toISOString() };
  const { data: after, error } = await admin.from("payment_channel_fees").update(payload).eq("channel_code", channel_code).select("*").single();
  if (error || !after) return NextResponse.json({ message: "Gagal menyimpan biaya channel." }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: auth.user.id,
    action: "payment_channel_fee_update",
    target_type: "payment_channel_fees",
    target_id: channel_code,
    metadata: { before, after },
  });
  return NextResponse.json({ channel: after });
}

const simulateSchema = z.object({
  channel_code: z.string().trim().min(1).max(50),
  amount: z.number().int("Nominal harus bilangan bulat.").positive("Nominal harus lebih dari 0."),
});

// Simulator: pakai fungsi perhitungan yang sama dengan alur top up asli.
export async function POST(request: Request) {
  const auth = await requireAdmin(true); if (auth.error) return auth.error;
  const parsed = simulateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message || "Data simulasi tidak valid." }, { status: 400 });

  const admin = createAdminClient();
  const { data: row, error } = await admin.from("payment_channel_fees").select("*").eq("channel_code", parsed.data.channel_code).maybeSingle();
  if (error || !row) return NextResponse.json({ ok: false, message: "Konfigurasi channel tidak ditemukan." }, { status: 404 });

  const result = calculateTopupFee(toChannelFeeInput(row), parsed.data.amount);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.error }, { status: 400 });
  return NextResponse.json({
    ok: true,
    channel_code: result.channel_code,
    label: result.label,
    channel_group: result.channel_group,
    saldo_masuk: result.saldo_masuk,
    biaya_gateway: result.biaya_gateway,
    biaya_admin: result.biaya_admin,
    total_biaya: result.total_biaya,
    total_bayar: result.total_bayar,
    // Estimasi laba bersih hanya dari biaya admin; biaya gateway bukan pemasukan.
    laba_bersih_estimasi: result.biaya_admin,
  });
}
