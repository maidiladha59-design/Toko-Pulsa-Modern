// Struktur menu panel admin. Satu sumber untuk sidebar, header, dan bottom nav.
// Permission memakai kunci yang sudah ada di tabel admin_role_permissions.

export type AdminBadgeCounts = {
  orders: number;
  kyc: number;
  support: number;
  manualTopup: number;
};

export type AdminBadgeKey = keyof AdminBadgeCounts;

export type AdminMenuItem = {
  href: string;
  icon: string;
  label: string;
  permission: string;
  badge?: AdminBadgeKey;
};

export type AdminMenuGroup = {
  key: string;
  label: string;
  items: AdminMenuItem[];
};

export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    key: "operasional",
    label: "Operasional",
    items: [
      { href: "/admin", icon: "chart_bar", label: "Dashboard", permission: "dashboard.view" },
      { href: "/admin/orders", icon: "receipt", label: "Pesanan", permission: "orders.manage", badge: "orders" },
      { href: "/admin/users", icon: "users", label: "Pengguna", permission: "users.view" },
      { href: "/admin/kyc", icon: "id_card", label: "KYC", permission: "users.view", badge: "kyc" },
      { href: "/admin/support", icon: "chat", label: "Bantuan", permission: "support.manage", badge: "support" },
      { href: "/admin/chat-moderation", icon: "scales", label: "Moderasi Diskusi", permission: "support.manage" },
      { href: "/admin/ratings", icon: "star_fill", label: "Rating & Ulasan", permission: "support.manage" },
      { href: "/admin/faq", icon: "help", label: "FAQ", permission: "support.manage" },
    ],
  },
  {
    key: "katalog",
    label: "Katalog",
    items: [
      { href: "/admin/products", icon: "box", label: "Produk", permission: "products.manage" },
      { href: "/admin/categories", icon: "tag", label: "Kategori", permission: "categories.manage" },
      { href: "/admin/product-images", icon: "image", label: "Gambar & Logo Brand", permission: "products.manage" },
      { href: "/admin/ppob", icon: "bolt", label: "PPOB", permission: "ppob.manage" },
      { href: "/admin/ppob/monitoring", icon: "terminal", label: "Monitoring PPOB", permission: "ppob.monitor" },
      { href: "/admin/ppob/health", icon: "activity", label: "Provider Health", permission: "ppob.monitor" },
    ],
  },
  {
    key: "keuangan",
    label: "Keuangan",
    items: [
      { href: "/admin/topups", icon: "wallet", label: "Top Up", permission: "topups.manage" },
      { href: "/admin/manual-topup/requests", icon: "inbox", label: "Top Up Manual", permission: "topups.manage", badge: "manualTopup" },
      { href: "/admin/manual-topup/channels", icon: "bank", label: "Channel Top Up Manual", permission: "topups.manage" },
      { href: "/admin/transfers", icon: "money_send", label: "Transfer Saldo", permission: "wallet.adjust" },
      { href: "/admin/payment-settings", icon: "card", label: "Pembayaran", permission: "payments.manage" },
      { href: "/admin/fees", icon: "coin", label: "Biaya", permission: "pricing.manage" },
      { href: "/admin/finance", icon: "banknote", label: "Keuangan", permission: "finance.view" },
      { href: "/admin/reconciliation", icon: "refresh", label: "Rekonsiliasi & Refund", permission: "reconciliation.manage" },
    ],
  },
  {
    key: "tampilan",
    label: "Tampilan",
    items: [
      { href: "/admin/pengaturan-beranda", icon: "home", label: "Pengaturan Beranda", permission: "platform.manage" },
      { href: "/admin/tema-branding", icon: "sun", label: "Tema & Branding", permission: "platform.manage" },
      { href: "/admin/navigasi-bawah", icon: "sliders", label: "Navigasi Bawah", permission: "platform.manage" },
      { href: "/admin/teks-halaman", icon: "doc", label: "Teks & Halaman", permission: "platform.manage" },
      { href: "/admin/level-kyc", icon: "trophy", label: "Level & KYC", permission: "platform.manage" },
      {
        href: "/admin/template-notifikasi",
        icon: "bell",
        label: "Template Notifikasi",
        permission: "platform.manage",
      },
      { href: "/admin/operator", icon: "phone", label: "Pengaturan Operator", permission: "platform.manage" },
      { href: "/admin/info-ticker", icon: "ticker", label: "Info Berjalan", permission: "platform.manage" },
      { href: "/admin/avatars", icon: "user", label: "Foto Profil", permission: "platform.manage" },
      { href: "/admin/promos", icon: "ticket", label: "Promo & Loyalty", permission: "promos.manage" },
      { href: "/admin/campaigns", icon: "megaphone", label: "Kampanye Push", permission: "platform.manage" },
    ],
  },
  {
    key: "keamanan",
    label: "Keamanan",
    items: [
      { href: "/admin/fraud", icon: "shield", label: "Fraud & Risk", permission: "monitoring.view" },
      { href: "/admin/permissions", icon: "lock", label: "Permission Admin", permission: "permissions.manage" },
      { href: "/admin/audit", icon: "clipboard", label: "Audit Log", permission: "audit.view" },
    ],
  },
  {
    key: "sistem",
    label: "Sistem",
    items: [
      { href: "/admin/system", icon: "settings", label: "Sistem", permission: "platform.manage" },
      { href: "/admin/identitas-usaha", icon: "office", label: "Identitas Usaha", permission: "platform.manage" },
      { href: "/admin/maintenance", icon: "tools", label: "Maintenance Mode", permission: "platform.manage" },
      { href: "/admin/features", icon: "sliders", label: "Fitur Aplikasi", permission: "platform.manage" },
      { href: "/admin/monitoring", icon: "signal", label: "Monitoring & Notifikasi", permission: "monitoring.view" },
      { href: "/admin/analytics", icon: "chart_line", label: "Analitik", permission: "analytics.view" },
    ],
  },
];

export function flattenAdminMenu(groups: AdminMenuGroup[]): AdminMenuItem[] {
  return groups.flatMap((group) => group.items);
}

export function filterAdminMenu(groups: AdminMenuGroup[], allowed: Iterable<string>): AdminMenuGroup[] {
  const permit = allowed instanceof Set ? allowed : new Set(allowed);
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => permit.has(item.permission)) }))
    .filter((group) => group.items.length > 0);
}

/** Cocokkan path aktif ke item paling spesifik; /admin tidak dianggap aktif di semua halaman. */
export function adminActiveHref(pathname: string, groups: AdminMenuGroup[] = ADMIN_MENU): string {
  let best = "";
  for (const item of flattenAdminMenu(groups)) {
    const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (active && item.href.length > best.length) best = item.href;
  }
  return best;
}

export function adminPageTitle(pathname: string): string {
  const href = adminActiveHref(pathname);
  return flattenAdminMenu(ADMIN_MENU).find((item) => item.href === href)?.label || "Panel Admin";
}
