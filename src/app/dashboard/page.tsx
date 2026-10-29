import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah, formatBalanceCompact, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import { Card } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import RatingPrompt from "@/components/RatingPrompt";
import Icon from "@/components/icons/Icon";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Sumber yang sama dengan rating & halaman Peringkat: hanya order COMPLETED.
  const [{ data: profile }, { data: wallet }, { data: orders }, { count: completedOrders }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
    supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
    supabase.from("orders").select("id, order_number, total_amount, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "COMPLETED"),
  ]);
  const firstName = (profile?.full_name || profile?.email || "Pengguna").split(" ")[0];

  const quickLinks = [
    ["bag", "Belanja", "Cari produk digital", "/"],
    ["wallet", "Top Up", "Tambah saldo", "/wallet/topup"],
    ["box", "Pesanan", "Lihat pembelian", "/orders"],
    ["user", "Profil", "Kelola akun", "/profile"],
  ];

  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-5 animate-page-in pb-10 lg:max-w-5xl">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-zinc-950 to-gold-700 p-6 text-white shadow-2xl sm:p-8">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-gold-400/15 blur-3xl" />
          <div className="relative grid items-center gap-5 md:grid-cols-[1fr_300px]">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-gold-100"><Icon name="sparkle" size={14} />Dashboard Pengguna</span>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Halo, {firstName}! <Icon name="sparkle" size={22} className="inline-block align-middle" /></h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-gold-100">Kelola saldo, pesanan, profil, dan koleksi produk digital Anda dari satu tempat.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/" className="btn-gold inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-black transition">Mulai Belanja<Icon name="arrow_right" size={16} /></Link>
                <Link href="/wallet" className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15">Lihat Saldo</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Card className="dashboard-card"><div className="flex items-center justify-between"><Icon name="card" size={24} /><Badge tone="gold">Wallet</Badge></div><p className="mt-4 text-xs font-bold text-app-muted">Saldo saat ini</p><p className="mt-1 truncate text-2xl font-black tabular-nums text-app-kicker" title={formatRupiah(wallet?.balance || 0)}>{formatBalanceCompact(wallet?.balance || 0)}</p><Link href="/wallet/topup" className="mt-3 inline-block text-sm font-bold text-app-kicker hover:underline">+ Top Up Saldo</Link></Card>
          <Card className="dashboard-card"><div className="flex items-center justify-between"><Icon name="box" size={24} /><Badge tone="success">Aktivitas</Badge></div><p className="mt-4 text-xs font-bold text-app-muted">Transaksi berhasil</p><p className="mt-1 text-2xl font-black tabular-nums text-app-text">{completedOrders ?? 0}</p><Link href="/orders" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-app-text transition hover:text-app-kicker">Lihat semua pesanan<Icon name="arrow_right" size={16} /></Link></Card>
          <Card className="dashboard-card"><div className="flex items-center justify-between"><Icon name="bolt" size={24} /><Badge tone="neutral">Cepat</Badge></div><p className="mt-4 text-xs font-bold text-app-muted">Akun</p><p className="mt-1 truncate text-lg font-black text-app-text">{profile?.email || "Akun pengguna"}</p><Link href="/profile" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-app-text transition hover:text-app-kicker">Edit profil<Icon name="arrow_right" size={16} /></Link></Card>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-app-kicker">Shortcut</p><h2 className="mt-1 text-xl font-black text-app-text">Menu Cepat</h2></div></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickLinks.map(([icon, title, desc, href]) => <Link key={title} href={href} className="dashboard-card group rounded-2xl border border-app-border bg-app-surface p-4"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-app-border bg-app-inset transition group-hover:scale-110 group-hover:border-gold-400/40 group-hover:bg-app-accent-soft"><Icon name={icon} size={20} /></span><p className="mt-3 font-black text-app-text transition group-hover:text-app-kicker">{title}</p><p className="mt-1 text-xs text-app-subtle">{desc}</p></Link>)}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-app-kicker">Aktivitas</p><h2 className="mt-1 text-xl font-black text-app-text">Pesanan Terbaru</h2></div><Link href="/orders" className="text-sm font-bold text-app-kicker hover:underline">Lihat semua</Link></div>
          {orders && orders.length > 0 ? (
            <div className="overflow-hidden rounded-3xl border border-app-border bg-app-surface">
              <div className="divide-y divide-app-border">{orders.map((o) => <Link href={`/orders/${o.id}`} key={o.id} className="flex items-center justify-between gap-3 p-4 transition hover:bg-app-inset"><div className="min-w-0"><p className="truncate font-bold text-app-text">{o.order_number}</p><p className="mt-1 text-xs text-app-subtle">{formatDate(o.created_at)}</p></div><div className="flex shrink-0 items-center gap-3"><span className="hidden text-sm font-bold tabular-nums text-app-text sm:block">{formatRupiah(o.total_amount)}</span><StatusBadge status={o.status} /></div></Link>)}</div>
            </div>
          ) : (
            <EmptyState icon="box" title="Belum ada pesanan" description="Yuk mulai belanja produk digital pertama Anda." action={<Link href="/" className="btn-gold-metal inline-flex min-h-[44px] items-center rounded-xl px-4 py-2.5 text-sm font-black transition">Mulai Belanja</Link>} />
          )}
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-gold-400/25 bg-app-accent-soft p-5"><div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold-400/10 blur-2xl" /><div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-1.5 font-black text-app-text"><Icon name="sparkle" size={16} />Siap menemukan produk baru?</p><p className="mt-1 text-sm text-app-muted">Jelajahi template, voucher, aset kreatif, dan produk digital lainnya.</p></div><Link href="/" className="btn-gold-metal rounded-xl px-4 py-2.5 text-center text-sm font-black transition hover:-translate-y-0.5">Jelajahi Sekarang</Link></div></section>
      </div>
      <RatingPrompt />
    </div>
  );
}
