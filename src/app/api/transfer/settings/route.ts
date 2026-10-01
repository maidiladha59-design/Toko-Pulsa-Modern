import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Pengaturan transfer + pemakaian limit milik user yang login.
// Saldo ikut dikembalikan agar form transfer bisa menampilkan saldo tersedia.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_transfer_settings");
  if (error) {
    console.error("transfer/settings error:", error);
    return NextResponse.json({ message: "Gagal membaca pengaturan transfer." }, { status: 500 });
  }

  const settings = Array.isArray(data) ? data[0] : data;
  if (!settings) {
    return NextResponse.json({ message: "Pengaturan transfer belum tersedia." }, { status: 500 });
  }

  const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();

  return NextResponse.json({
    enabled: settings.enabled,
    fee_type: settings.fee_type,
    fee_value: Number(settings.fee_value || 0),
    min_transfer: Number(settings.min_transfer || 0),
    max_transfer: Number(settings.max_transfer || 0),
    daily_limit: Number(settings.daily_limit || 0),
    monthly_limit: Number(settings.monthly_limit || 0),
    used_today: Number(settings.used_today || 0),
    used_this_month: Number(settings.used_this_month || 0),
    balance: Number(wallet?.balance || 0),
  });
}
