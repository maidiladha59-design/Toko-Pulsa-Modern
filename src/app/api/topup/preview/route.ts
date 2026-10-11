import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateTopupFee, toChannelFeeInput } from "@/lib/topup-fee";

const querySchema = z.object({
  channel_code: z.string().trim().min(1).max(50),
  amount: z.number({ invalid_type_error: "Nominal tidak valid." }).int("Nominal harus bilangan bulat.").positive("Nominal harus lebih dari 0."),
});

async function computeChannelPreview(channelCode: string, amount: number) {
  const admin = createAdminClient();
  const { data: row, error } = await admin.from("payment_channel_fees").select("*").eq("channel_code", channelCode).maybeSingle();
  if (error) return { status: 500 as const, body: { ok: false, code: "CHANNEL_CONFIG_UNAVAILABLE", message: "Gagal membaca konfigurasi biaya channel." } };
  if (!row) return { status: 400 as const, body: { ok: false, code: "CHANNEL_CONFIG_UNAVAILABLE", message: "Konfigurasi biaya untuk channel ini belum tersedia." } };

  const result = calculateTopupFee(toChannelFeeInput(row), amount);
  if (!result.ok) return { status: 400 as const, body: { ok: false, code: result.code, message: result.error } };

  return {
    status: 200 as const,
    body: {
      ok: true,
      channel_code: result.channel_code,
      label: result.label,
      channel_group: result.channel_group,
      customer_note: result.customer_note,
      saldo_masuk: result.saldo_masuk,
      biaya_gateway: result.biaya_gateway,
      biaya_admin: result.biaya_admin,
      total_biaya: result.total_biaya,
      total_bayar: result.total_bayar,
      formula_version: result.formula_version,
    },
  };
}

async function handle(channelCode: unknown, amount: unknown) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "UNAUTHORIZED", message: "Silakan login terlebih dahulu." }, { status: 401 });

  const parsed = querySchema.safeParse({ channel_code: channelCode, amount });
  if (!parsed.success) return NextResponse.json({ ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message || "Data tidak valid." }, { status: 400 });

  const result = await computeChannelPreview(parsed.data.channel_code, parsed.data.amount);
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const amount = params.get("amount");
  return handle(params.get("channel_code"), amount == null ? undefined : Number(amount));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return handle(body?.channel_code, body?.amount);
}
