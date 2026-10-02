import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallet }, { data: orders }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
    supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
    supabase.from("orders").select("id, order_number, total_amount, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
  ]);

  const { count: totalOrders } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  const firstName = (profile?.full_name || profile?.email || "Pengguna").split(" ")[0];

  const quickLinks = [
    ["🛍️", "Belanja", "Cari produk digital", "/"],
    ["💰", "Top Up", "Tambah saldo", "/wallet/topup"],
    ["📦", "Pesanan", "Lihat pembelian", "/orders"],
    ["👤", "Profil", "Kelola akun", "/profile"],
  ];

  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-6 animate-page-in pb-10 lg:max-w-5xl">
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-zinc-950 to-gold-700 p-6 text-white shadow-2xl sm:p-8">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-gold-400/15 blur-3xl" />
          <div className="relative grid items-center gap-5 md:grid-cols-[1fr_300px]">
            <div>
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-gold-100">✨ Dashboard Pengguna</span>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Halo, {firstName}! 👋</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-gold-100">Kelola saldo, pesanan, profil, dan koleksi produk digitalmu dari satu tempat.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/" className="rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-black text-zinc-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-gold-300">Mulai Belanja →</Link>
                <Link href="/wallet" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15">Lihat Saldo</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="dashboard-card rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between"><span className="text-2xl">💳</span><span className="rounded-full bg-gold-400/10 px-2 py-1 text-[10px] font-black uppercase text-gold-400">Wallet</span></div><p className="mt-4 text-xs font-semibold text-zinc-400">Saldo saat ini</p><p className="mt-1 text-2xl font-black tabular-nums text-gold-400">{formatRupiah(wallet?.balance || 0)}</p><Link href="/wallet/topup" className="mt-3 inline-block text-sm font-bold text-gold-400 hover:underline">+ Top Up Saldo</Link></div>
          <div className="dashboard-card rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between"><span className="text-2xl">📦</span><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase text-emerald-400">Aktivitas</span></div><p className="mt-4 text-xs font-semibold text-zinc-400">Total pesanan</p><p className="mt-1 text-2xl font-black tabular-nums text-white">{totalOrders ?? 0}</p><Link href="/orders" className="mt-3 inline-block text-sm font-bold text-zinc-300 transition hover:text-gold-400">Lihat semua pesanan →</Link></div>
          <div className="dashboard-card rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between"><span className="text-2xl">⚡</span><span className="rounded-full bg-gold-400/10 px-2 py-1 text-[10px] font-black uppercase text-gold-400">Cepat</span></div><p className="mt-4 text-xs font-semibold text-zinc-400">Akun</p><p className="mt-1 truncate text-lg font-black text-white">{profile?.email || "Akun pengguna"}</p><Link href="/profile" className="mt-3 inline-block text-sm font-bold text-zinc-300 transition hover:text-gold-400">Edit profil →</Link></div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">Shortcut</p><h2 className="mt-1 text-xl font-black text-white">Menu Cepat</h2></div></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickLinks.map(([icon, title, desc, href]) => <Link key={title} href={href} className="dashboard-card group rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-xl transition group-hover:scale-110 group-hover:border-gold-400/40 group-hover:bg-gold-400/10">{icon}</span><p className="mt-3 font-black text-white transition group-hover:text-gold-400">{title}</p><p className="mt-1 text-xs text-zinc-500">{desc}</p></Link>)}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">Aktivitas</p><h2 className="mt-1 text-xl font-black text-white">Pesanan Terbaru</h2></div><Link href="/orders" className="text-sm font-bold text-gold-400 hover:underline">Lihat semua</Link></div>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            {orders && orders.length > 0 ? <div className="divide-y divide-zinc-800">{orders.map((o) => <Link href={`/orders/${o.id}`} key={o.id} className="flex items-center justify-between gap-3 p-4 transition hover:bg-white/5"><div className="min-w-0"><p className="truncate font-bold text-white">{o.order_number}</p><p className="mt-1 text-xs text-zinc-500">{formatDate(o.created_at)}</p></div><div className="flex shrink-0 items-center gap-3"><span className="hidden text-sm font-bold tabular-nums text-zinc-300 sm:block">{formatRupiah(o.total_amount)}</span><StatusBadge status={o.status} /></div></Link>)}</div> : <div className="flex flex-col items-center gap-2 px-6 py-12 text-center"><span className="text-3xl">📦</span><p className="text-sm font-bold text-white">Belum ada pesanan</p><p className="text-xs leading-5 text-zinc-400">Yuk mulai belanja produk digital pertama Anda.</p></div>}
          </div>
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-gold-400/25 bg-gold-400/10 p-5"><div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold-400/10 blur-2xl" /><div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-white">✨ Siap menemukan produk baru?</p><p className="mt-1 text-sm text-zinc-400">Jelajahi template, voucher, aset kreatif, dan produk digital lainnya.</p></div><Link href="/" className="rounded-xl bg-gold-400 px-4 py-2.5 text-center text-sm font-black text-zinc-950 transition hover:-translate-y-0.5 hover:bg-gold-300">Jelajahi Sekarang</Link></div></section>
      </div>
    </div>
  );
}
