import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_2FA_COOKIE, verifyAdmin2FAToken } from "@/lib/security/admin-2fa";
import { ADMIN_MENU, filterAdminMenu, flattenAdminMenu, type AdminBadgeCounts } from "@/lib/admin-menu";
import { getBottomNav } from "@/lib/site-settings";
import AdminShell from "./AdminShell";

// Hitung antrean untuk badge menu. Gagal satu hitungan tidak boleh memblokir panel.
async function safeCount(run: () => PromiseLike<{ count: number | null; error: unknown }>) {
  try {
    const { count, error } = await run();
    return error ? 0 : Number(count || 0);
  } catch {
    return 0;
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/admin-login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name, email").eq("id", user.id).single();
  if (!profile || (profile.role !== "ADMIN" && profile.role !== "SUPER_ADMIN")) redirect("/dashboard");

  // Password saja belum cukup — wajib lolos verifikasi 2 langkah (OTP email) sebelum masuk panel admin.
  const twoFactorToken = cookies().get(ADMIN_2FA_COOKIE)?.value;
  if (!verifyAdmin2FAToken(twoFactorToken, user.id)) redirect("/admin-login");

  const isSuperAdmin = profile.role === "SUPER_ADMIN";

  const { data: permissionRows, error: permissionError } = await supabase
    .from("admin_role_permissions")
    .select("permission,enabled")
    .eq("role", profile.role);

  // Fallback hanya untuk tampilan menu; otorisasi API tetap di database.
  const allowed = permissionError || !permissionRows?.length
    ? new Set(flattenAdminMenu(ADMIN_MENU).map((item) => item.permission).filter((permission) => isSuperAdmin || permission !== "permissions.manage"))
    : new Set(permissionRows.filter((row) => row.enabled).map((row) => String(row.permission)));
  const groups = filterAdminMenu(ADMIN_MENU, allowed);

  const [orders, kyc, support, manualTopup, navSettings] = await Promise.all([
    safeCount(() => supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "PROCESSING")),
    // kyc_verifications hanya bisa dihitung lewat service role; klien dibuat di dalam
    // safeCount agar env yang belum diisi tidak menjatuhkan seluruh panel.
    safeCount(async () => createAdminClient().from("kyc_verifications").select("user_id", { count: "exact", head: true }).eq("status", "SUBMITTED")),
    safeCount(() => supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "OPEN")),
    safeCount(() => supabase.from("manual_topup_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING")),
    getBottomNav("admin"),
  ]);
  const badges: AdminBadgeCounts = { orders, kyc, support, manualTopup };

  return (
    <AdminShell groups={groups} badges={badges} adminId={user.id} navSettings={navSettings}>
      {children}
    </AdminShell>
  );
}
