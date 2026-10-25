import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });

  const [channelResult, settingResult] = await Promise.all([
    supabase
      .from("manual_topup_channels")
      .select("id, channel_type, display_name, account_number, account_holder_name, qris_image_url, instructions, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("manual_topup_settings")
      .select("is_enabled, min_amount, max_amount")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  if (channelResult.error || settingResult.error) {
    console.error("[manual-topup] gagal memuat channel", JSON.stringify({
      channels: channelResult.error?.code ?? null,
      settings: settingResult.error?.code ?? null,
    }));
    return NextResponse.json(
      { message: "Top Up Manual belum tersedia. Silakan hubungi admin." },
      { status: 503 }
    );
  }

  const settings = settingResult.data;
  return NextResponse.json({
    enabled: Boolean(settings?.is_enabled),
    min_amount: Number(settings?.min_amount ?? 10000),
    max_amount: Number(settings?.max_amount ?? 5000000),
    channels: channelResult.data ?? [],
  });
}
