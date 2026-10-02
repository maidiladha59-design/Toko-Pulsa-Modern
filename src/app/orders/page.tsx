import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";

export default async function OrdersPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, total_amount, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] animate-page-in">
        <p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">Akun</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">Pesanan Saya</h1>
        <p className="mt-1 text-sm text-zinc-400">Riwayat seluruh pesanan yang pernah kamu buat.</p>

        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          {orders && orders.length > 0 ? (
            <div className="divide-y divide-zinc-800">
              {orders.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-white/5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-lg">
                    🧾
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white transition group-hover:text-gold-400">{o.order_number}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{formatDate(o.created_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums text-gold-400">{formatRupiah(o.total_amount)}</p>
                    <div className="mt-1 flex justify-end"><StatusBadge status={o.status} /></div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="text-3xl">📦</span>
              <p className="text-sm font-bold text-white">Belum ada pesanan</p>
              <p className="text-xs leading-5 text-zinc-400">Pesanan yang Anda buat akan muncul di sini.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
