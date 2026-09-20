import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/utils";

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
    ["👥", "Total Pengguna", userCount ?? 0],
    ["💰", "Top Up Menunggu", pendingTopups ?? 0],
    ["🧾", "Total Pesanan", totalOrders ?? 0],
    ["💵", "Pendapatan Selesai", formatRupiah(revenue)],
  ];
  return <div>
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-zinc-900 via-gold-700 to-black p-6 text-white shadow-lg shadow-gold-500/15"><p className="text-sm font-medium text-gold-100">Selamat datang kembali 👋</p><h1 className="mt-1 text-2xl font-black">Dashboard Admin</h1><p className="mt-1 text-sm text-gold-100">Pantau aktivitas AIDIL STORE dari panel administrasi.</p></div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([icon, label, value]) => <div key={label} className="dashboard-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-2xl">{icon}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">Live</span></div><p className="mt-4 text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p></div>)}</div>
    <div className="mt-6 grid gap-4 md:grid-cols-2 animate-page-in"><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Akses Cepat</h2><div className="mt-4 grid grid-cols-2 gap-3"><a href="/admin/products" className="rounded-xl bg-slate-50 p-4 text-sm font-bold hover:bg-gold-50 hover:text-zinc-900">📦 Kelola Produk</a><a href="/admin/orders" className="rounded-xl bg-slate-50 p-4 text-sm font-bold hover:bg-gold-50 hover:text-zinc-900">🧾 Cek Pesanan</a><a href="/admin/topups" className="rounded-xl bg-slate-50 p-4 text-sm font-bold hover:bg-gold-50 hover:text-zinc-900">💰 Verifikasi Top Up</a><a href="/admin/payment-settings" className="rounded-xl bg-slate-50 p-4 text-sm font-bold hover:bg-gold-50 hover:text-zinc-900">💳 Pembayaran</a></div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Keamanan</h2><p className="mt-2 text-sm leading-6 text-slate-500">Halaman admin hanya dapat dibuka oleh pengguna dengan role <b>ADMIN</b> atau <b>SUPER_ADMIN</b>. Logout tersedia di menu admin.</p></div></div>
  </div>;
}
