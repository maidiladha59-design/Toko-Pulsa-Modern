import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Guard khusus API Top Up Manual. Role diperiksa di API dan sekali lagi di
// dalam RPC/RLS database supaya tidak bisa dilewati dari klien.
export async function requireManualTopupAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }

  return { user, supabase };
}
