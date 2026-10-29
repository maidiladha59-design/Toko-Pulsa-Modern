"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import Icon from "@/components/icons/Icon";

// [href, nama ikon registry, label] — seluruh ikon dari src/components/icons.
const MENU = [
  ["/admin", "chart_bar", "Dashboard"],
  ["/admin/products", "box", "Produk"],
  ["/admin/categories", "tag", "Kategori"],
  ["/admin/orders", "receipt", "Pesanan"],
  ["/admin/support", "chat", "Bantuan"],
  ["/admin/chat-moderation", "scales", "Moderasi Diskusi"],
  ["/admin/ratings", "star_fill", "Rating & Ulasan"],
  ["/admin/kyc", "id_card", "KYC"],
  ["/admin/faq", "help", "FAQ"],
  ["/admin/users", "users", "Pengguna"],
  ["/admin/topups", "wallet", "Top Up"],
  ["/admin/manual-topup/requests", "inbox", "Top Up Manual"],
  ["/admin/manual-topup/channels", "bank", "Channel Top Up Manual"],
  ["/admin/transfers", "money_send", "Transfer Saldo"],
  ["/admin/payment-settings", "card", "Pembayaran"],
  ["/admin/payment-channel-fees", "coin", "Biaya Channel"],
  ["/admin/platform", "settings", "Platform & Biaya"],
  ["/admin/identitas-usaha", "office", "Identitas Usaha"],
  ["/admin/maintenance", "tools", "Maintenance Mode"],
  ["/admin/features", "sliders", "Fitur Aplikasi"],
  ["/admin/campaigns", "megaphone", "Kampanye Push"],
  ["/admin/pricing", "calculator", "Harga & Biaya Transaksi"],
  ["/admin/analytics", "chart_line", "Analitik"],
  ["/admin/finance", "banknote", "Keuangan"],
  ["/admin/reconciliation", "refresh", "Rekonsiliasi & Refund"],
  ["/admin/fraud", "shield", "Fraud & Risk"],
  ["/admin/monitoring", "signal", "Monitoring & Notifikasi"],
  ["/admin/promos", "ticket", "Promo & Loyalty"],
  ["/admin/permissions", "lock", "Permission Admin"],
  ["/admin/audit", "clipboard", "Audit Log"],
  ["/admin/ppob", "bolt", "PPOB"],
  ["/admin/ppob/monitoring", "terminal", "Monitoring PPOB"],
  ["/admin/ppob/health", "activity", "Provider Health"],
  ["/admin/brand-media", "image", "Logo Brand"],
  ["/admin/avatars", "user", "Foto Profil"],
  ["/admin/info-ticker", "ticker", "Info Berjalan"],
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
            return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-gold-400/15 font-black text-app-kicker" : "font-bold text-app-muted hover:bg-app-accent-soft hover:text-app-text"}`}><Icon name={icon} size={18} />{label}</Link>;
          })}
        </div>
        <div className="mt-4 border-t border-app-border pt-3">
          <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-app-muted transition hover:bg-app-accent-soft hover:text-app-text"><Icon name="home" size={18} />Lihat Toko</Link>
          <button disabled={loading} onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-danger-600 transition hover:bg-danger-500/10 dark:text-danger-400 disabled:opacity-60"><Icon name="logout" size={18} />{loading ? "Keluar..." : "Keluar"}</button>
        </div>
      </nav>
    </aside>
  );
}
