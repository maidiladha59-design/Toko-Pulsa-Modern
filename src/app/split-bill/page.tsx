import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SplitBillClient from "./SplitBillClient";

export default async function SplitBillPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent("/split-bill")}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-3xl bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-widest text-amber-300">Patungan</p>
        <h1 className="mt-2 text-2xl font-black">Split Bill</h1>
        <p className="mt-2 text-sm text-white/60">Buat tagihan patungan, pilih peserta dari kontak favorit atau cari lewat email/nomor HP. Setiap peserta membayar bagiannya langsung ke Anda lewat transfer saldo.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/transfer-uang" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20">📤 Transfer Saldo</Link>
          <Link href="/wallet" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20">💰 Lihat Saldo</Link>
        </div>
      </div>

      <SplitBillClient />
    </div>
  );
}
