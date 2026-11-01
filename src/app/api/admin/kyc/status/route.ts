import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Ringkasan status untuk lencana di daftar pengguna. Hanya membaca; tidak
// menyentuh alur review KYC.
async function adminUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile && ["ADMIN", "SUPER_ADMIN"].includes(profile.role) ? user : null;
}

export async function GET() {
  const user = await adminUser();
  if (!user) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const { data, error } = await createAdminClient()
    .from("kyc_verifications")
    .select("user_id")
    .eq("status", "VERIFIED");
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  return NextResponse.json({ verified: (data || []).map((row) => row.user_id) });
}
