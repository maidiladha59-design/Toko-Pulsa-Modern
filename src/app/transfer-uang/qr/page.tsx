import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PersonalQrClient from "./PersonalQrClient";
import Icon from "@/components/icons/Icon";

export default async function PersonalQrPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent("/transfer-uang/qr")}`);

  const { data: token } = await supabase.rpc("ensure_user_qr_token");
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single();
  const displayName = profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Pengguna AIDIL STORE";

  if (!token) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-warning-500/30 bg-warning-500/10 p-6">
        <h1 className="text-xl font-black text-app-text">QR Pribadi belum tersedia</h1>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          Jalankan migration <code className="rounded bg-app-inset px-1.5 py-0.5 text-xs font-bold text-app-text">supabase/migrations_v75_wallet_transfer_qr.sql</code> di Supabase, lalu muat ulang halaman ini.
        </p>
        <Link href="/transfer-uang" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white"><Icon name="arrow_left" size={16} /> Kembali ke Transfer</Link>
      </div>
    );
  }

  return <PersonalQrClient token={String(token)} displayName={displayName} />;
}
