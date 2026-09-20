import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_2FA_COOKIE, verifyAdmin2FAToken } from "@/lib/security/admin-2fa";
import AdminSidebar from "./AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin-login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name, email").eq("id", user.id).single();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "SUPER_ADMIN")) redirect("/dashboard");

  // Password saja belum cukup — wajib lolos verifikasi 2 langkah (OTP email) sebelum masuk panel admin.
  const twoFactorToken = cookies().get(ADMIN_2FA_COOKIE)?.value;
  if (!verifyAdmin2FAToken(twoFactorToken, user.id)) redirect("/admin-login");

  return <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-[230px_1fr]"><AdminSidebar /><section className="min-w-0">{children}</section></div>;
}
