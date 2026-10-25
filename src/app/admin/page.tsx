import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatBalanceCompact, formatRupiah } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

export default async function AdminDashboardPage() {
  const supabase = createClient();
  const [{ count: userCount }, { count: pendingTopups }, { count: totalOrders }, { data: revenueRows }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("topups").select("id", { count: "exact", head: true }).in("status", ["PENDING", "VERIFYING"]),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("total_amount").eq("status", "COMPLETED"),
  ]);
  const revenue = (revenueRows || []).reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const cards = [
    { icon: "👥", label: "Total Pengguna", value: String(userCount ?? 0) },
    { icon: "💰", label: "Top Up Menunggu", value: String(pendingTopups ?? 0) },
    { icon: "🧾", label: "Total Pesanan", value: String(totalOrders ?? 0) },
    {
      icon: "💵",
      label: "Pendapatan Selesai",
      value: formatBalanceCompact(revenue),
      title: formatRupiah(revenue),
    },
  ];
  return <div>
    <div className="mb-5 rounded-3xl bg-gradient-to-r from-zinc-900 via-gold-700 to-black p-6 text-white shadow-lg shadow-gold-500/15"><p className="text-xs font-black uppercase tracking-widest text-gold-100">Selamat datang kembali 👋</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Dashboard Admin</h1><p className="mt-1 text-sm text-gold-100">Pantau aktivitas AIDIL STORE dari panel administrasi.</p></div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <Card key={card.label} className="dashboard-card"><div className="flex items-center justify-between"><span className="text-2xl">{card.icon}</span><Badge tone="neutral" className="px-2 py-1 uppercase">Live</Badge></div><p className="mt-4 text-xs font-bold text-app-muted">{card.label}</p><p className="mt-1 truncate text-2xl font-black tabular-nums text-app-text" title={card.title}>{card.value}</p></Card>)}</div>
    <div className="mt-5 grid gap-3 md:grid-cols-2 animate-page-in"><Card><CardTitle>Akses Cepat</CardTitle><div className="mt-3 grid grid-cols-2 gap-3">{[["/admin/products", "📦 Kelola Produk"], ["/admin/orders", "🧾 Cek Pesanan"], ["/admin/topups", "💰 Verifikasi Top Up"], ["/admin/payment-settings", "💳 Pembayaran"]].map(([href, text]) => <Link key={href} href={href} className="rounded-xl border border-app-border bg-app-inset p-4 text-sm font-bold text-app-text transition hover:border-gold-400 hover:bg-app-accent-soft">{text}</Link>)}</div></Card><Card><CardTitle>Keamanan</CardTitle><p className="mt-3 text-sm leading-6 text-app-muted">Halaman admin hanya dapat dibuka oleh pengguna dengan role <b>ADMIN</b> atau <b>SUPER_ADMIN</b>. Logout tersedia di menu admin.</p></Card></div>
  </div>;
}
