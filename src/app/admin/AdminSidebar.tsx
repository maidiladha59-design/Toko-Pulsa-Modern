"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

const MENU = [
  ["/admin", "📊", "Dashboard"],
  ["/admin/products", "📦", "Produk"],
  ["/admin/categories", "🏷️", "Kategori"],
  ["/admin/orders", "🧾", "Pesanan"],
  ["/admin/support", "💬", "Bantuan"],
  ["/admin/kyc", "🪪", "KYC"],
  ["/admin/faq", "❓", "FAQ"],
  ["/admin/users", "👥", "Pengguna"],
  ["/admin/topups", "💰", "Top Up"],
  ["/admin/payment-settings", "💳", "Pembayaran"],
  ["/admin/platform", "⚙️", "Platform & Biaya"],
  ["/admin/maintenance", "🛠️", "Maintenance Mode"],
  ["/admin/pricing", "🧮", "Harga & Biaya Transaksi"],
  ["/admin/analytics", "📈", "Analitik"],
  ["/admin/finance", "💹", "Keuangan"],
  ["/admin/reconciliation", "🔄", "Rekonsiliasi & Refund"],
  ["/admin/fraud", "🛡️", "Fraud & Risk"],
  ["/admin/monitoring", "📡", "Monitoring & Notifikasi"],
  ["/admin/promos", "🎟️", "Promo & Loyalty"],
  ["/admin/permissions", "🔐", "Permission Admin"],
  ["/admin/audit", "🧾", "Audit Log"],
  ["/admin/ppob", "⚡", "PPOB"],
  ["/admin/ppob/monitoring", "📡", "Monitoring PPOB"],
  ["/admin/ppob/health", "🩺", "Provider Health"],
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await createClient().auth.signOut();
    router.replace("/admin-login");
    router.refresh();
  }

  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-zinc-900 via-gold-700 to-black p-4 text-white">
        <img src="/aidil-logo.png" alt="Aidil Store" className="h-11 w-11 rounded-xl bg-white p-1" />
        <div><p className="font-black">AIDIL STORE</p><p className="text-xs text-yellow-200">Panel Admin</p></div>
      </div>
      <nav className="p-3">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Menu utama</p>
        <div className="space-y-1">
          {MENU.map(([href, icon, label]) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? "bg-gold-50 text-zinc-900" : "text-slate-600 hover:bg-gold-50"}`}><span>{icon}</span>{label}</Link>;
          })}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 hover:bg-gold-50">🏠 Lihat Toko</Link>
          <button disabled={loading} onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">🚪 {loading ? "Keluar..." : "Keluar"}</button>
        </div>
      </nav>
    </aside>
  );
}
