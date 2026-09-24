import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/utils";
import TransactionCenter from "@/components/TransactionCenter";

export default async function TransactionsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: orders }, { data: wallet }] = await Promise.all([
    supabase.from("orders").select("id, order_number, total_amount, status, created_at, payment_method").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("wallets").select("id, balance").eq("user_id", user.id).maybeSingle(),
  ]);
  const ids = (orders || []).map(o => o.id);
  const [{ data: items }, { data: walletTx }] = await Promise.all([
    ids.length ? supabase.from("order_items").select("id, order_id, product_name").in("order_id", ids) : Promise.resolve({ data: [] as any[] }),
    wallet ? supabase.from("wallet_transactions").select("id, type, amount, reference_id, created_at").eq("wallet_id", wallet.id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] as any[] }),
  ]);
  const itemIds = (items || []).map(i => i.id);
  const { data: ppob } = itemIds.length ? await supabase.from("ppob_transactions").select("id, order_item_id, customer_no, status").in("order_item_id", itemIds) : { data: [] as any[] };
  const itemMap = new Map((items || []).map(i => [i.id, i]));
  const ppobMap = new Map((ppob || []).map(t => [t.order_item_id, t]));

  const entries = (orders || []).map(o => {
    const orderItems = (items || []).filter(i => i.order_id === o.id);
    const tx = orderItems.map(i => ppobMap.get(i.id)).find(Boolean);
    const product = orderItems[0]?.product_name || "Pesanan AIDIL STORE";
    return {
      id: o.id,
      kind: "order" as const,
      title: o.order_number,
      subtitle: product,
      amount: -Number(o.total_amount),
      status: o.status,
      date: o.created_at,
      href: o.status === "PENDING" ? `/orders/${o.id}` : `/orders/${o.id}/receipt`,
      target: tx?.customer_no,
    };
  });

  const walletEntries = (walletTx || []).map(t => ({
    id: t.id,
    kind: "wallet" as const,
    title: t.type === "TOPUP" ? "Top Up Saldo" : t.type === "REFUND" ? "Refund" : "Transaksi Wallet",
    subtitle: t.reference_id ? `Ref: ${String(t.reference_id).slice(0, 8).toUpperCase()}` : "Saldo AIDIL STORE",
    amount: Number(t.amount),
    status: "SUCCESS",
    date: t.created_at,
    href: `/transactions/wallet/${t.id}`,
  }));

  const allEntries = [...entries, ...walletEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const successCount = entries.filter(e => e.status === "COMPLETED").length;
  const processingCount = entries.filter(e => ["PENDING", "PROCESSING"].includes(e.status)).length;

  return <div className="mx-auto max-w-6xl space-y-6 animate-page-in pb-10">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-600">Pusat Aktivitas</p><h1 className="mt-1 text-3xl font-black tracking-tight">Riwayat Transaksi</h1><p className="mt-1 text-sm text-slate-500">Pantau pulsa, game, tagihan, pesanan, dan perubahan saldo dari satu halaman. Ketuk transaksi untuk melihat struk.</p></div><Link href="/orders" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-black text-slate-700 hover:bg-slate-50">Lihat Pesanan</Link></div>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Saldo sekarang</p><p className="mt-1 text-xl font-black text-gold-600">{formatRupiah(Number(wallet?.balance || 0))}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Pesanan berhasil</p><p className="mt-1 text-xl font-black text-emerald-600">{successCount}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-slate-500">Sedang diproses</p><p className="mt-1 text-xl font-black text-amber-600">{processingCount}</p></div></div>
    <TransactionCenter entries={allEntries} />
  </div>;
}