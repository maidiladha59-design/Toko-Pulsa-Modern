import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SplitBillDetailClient from "./SplitBillDetailClient";

export default async function SplitBillDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/split-bill/${params.id}`)}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-3xl bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-widest text-amber-300">Patungan</p>
        <h1 className="mt-2 text-2xl font-black">Detail Tagihan</h1>
        <p className="mt-2 text-sm text-white/60">Lihat siapa yang sudah membayar, bayar bagian Anda, atau kirim pengingat ke peserta yang belum bayar.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/split-bill" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20">🧾 Semua Tagihan</Link>
          <Link href="/wallet" className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20">💰 Lihat Saldo</Link>
        </div>
      </div>

      <SplitBillDetailClient billId={params.id} />
    </div>
  );
}
