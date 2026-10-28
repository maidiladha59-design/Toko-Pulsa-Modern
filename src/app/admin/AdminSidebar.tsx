"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

const MENU = [
  ["/admin", "📊", "Dashboard"],
  ["/admin/products", "📦", "Produk"],
  ["/admin/categories", "🏷️", "Kategori"],
  ["/admin/orders", "🧾", "Pesanan"],
  ["/admin/support", "💬", "Bantuan"],
  ["/admin/chat-moderation", "◈", "Moderasi Diskusi"],
  ["/admin/ratings", "⭐", "Rating & Ulasan"],
  ["/admin/kyc", "🪪", "KYC"],
  ["/admin/faq", "❓", "FAQ"],
  ["/admin/users", "👥", "Pengguna"],
  ["/admin/topups", "💰", "Top Up"],
  ["/admin/manual-topup/requests", "🧾", "Top Up Manual"],
  ["/admin/manual-topup/channels", "🏦", "Channel Top Up Manual"],
  ["/admin/transfers", "💸", "Transfer Saldo"],
  ["/admin/payment-settings", "💳", "Pembayaran"],
  ["/admin/payment-channel-fees", "🧾", "Biaya Channel"],
  ["/admin/platform", "⚙️", "Platform & Biaya"],
  ["/admin/identitas-usaha", "🏢", "Identitas Usaha"],
  ["/admin/maintenance", "🛠️", "Maintenance Mode"],
  ["/admin/features", "🎚️", "Fitur Aplikasi"],
  ["/admin/campaigns", "📣", "Kampanye Push"],
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
  ["/admin/brand-media", "🖼️", "Logo Brand"],
  ["/admin/avatars", "🙂", "Foto Profil"],
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
    <aside className="overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-zinc-900 via-gold-700 to-black p-4 text-white">
        <Image src="/aidil-logo.png" alt="Logo AIDIL STORE" width={44} height={44} className="h-11 w-11 rounded-xl bg-white p-1" />
        <div><p className="font-black">AIDIL STORE</p><p className="text-xs font-black uppercase tracking-widest text-gold-200">Panel Admin</p></div>
      </div>
      <nav className="p-3">
        <p className="px-3 pb-2 text-[10px] font-black uppercase tracking-widest text-app-kicker">Menu utama</p>
        <div className="space-y-1">
          {MENU.map(([href, icon, label]) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-gold-400/15 font-black text-app-kicker" : "font-bold text-app-muted hover:bg-app-accent-soft hover:text-app-text"}`}><span>{icon}</span>{label}</Link>;
          })}
        </div>
        <div className="mt-4 border-t border-app-border pt-3">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-app-muted transition hover:bg-app-accent-soft hover:text-app-text">🏠 Lihat Toko</Link>
          <button disabled={loading} onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-danger-600 transition hover:bg-danger-500/10 dark:text-danger-400 disabled:opacity-60">🚪 {loading ? "Keluar..." : "Keluar"}</button>
        </div>
      </nav>
    </aside>
  );
}
