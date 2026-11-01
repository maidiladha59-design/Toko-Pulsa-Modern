import type { IconName } from "@/components/icons/registry";

// Satu sumber menu drawer pelanggan. Dipakai Navbar untuk membangun grup,
// badge, dan penanda item aktif. Href tidak boleh diubah tanpa memindahkan
// halaman tujuan yang sudah ada.

export type UserBadgeKey = "notifications" | "orders" | "support";

export type UserMenuItem = {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  loginOnly?: boolean;
  adminOnly?: boolean;
  feature?: "scan_qris";
  badge?: UserBadgeKey;
};

export type UserMenuGroup = {
  id: string;
  label: string;
  items: UserMenuItem[];
};

export const USER_MENU_GROUPS: UserMenuGroup[] = [
  {
    id: "utama",
    label: "Utama",
    items: [
      { id: "beranda", label: "Beranda", icon: "home", href: "/" },
      { id: "layanan", label: "Layanan", icon: "bag", href: "/layanan" },
      { id: "dashboard", label: "Dashboard", icon: "chart_bar", href: "/dashboard", loginOnly: true },
      { id: "pesanan", label: "Pesanan", icon: "box", href: "/orders", loginOnly: true, badge: "orders" },
      { id: "transaksi", label: "Transaksi", icon: "doc", href: "/transactions", loginOnly: true },
    ],
  },
  {
    id: "keuangan",
    label: "Keuangan",
    items: [
      { id: "saldo", label: "Saldo & Top Up", icon: "wallet", href: "/wallet", loginOnly: true },
      { id: "transfer", label: "Transfer Saldo", icon: "money_send", href: "/transfer-uang", loginOnly: true },
      { id: "qr-pribadi", label: "QR Pribadi", icon: "qris", href: "/transfer-uang/qr", loginOnly: true },
      { id: "scan-qris", label: "Scan QRIS", icon: "scan", href: "/scan-qris", feature: "scan_qris" },
      { id: "split-bill", label: "Split Bill", icon: "receipt", href: "/split-bill", loginOnly: true },
      { id: "kalkulator", label: "Kalkulator", icon: "calculator", href: "/calculator" },
    ],
  },
  {
    id: "komunitas",
    label: "Komunitas & Hadiah",
    items: [
      { id: "diskusi", label: "Ruang Diskusi", icon: "chat", href: "/diskusi", loginOnly: true },
      { id: "referral", label: "Undang Teman", icon: "gift", href: "/referral", loginOnly: true },
      { id: "missions", label: "Misi & Hadiah", icon: "target", href: "/missions", loginOnly: true },
    ],
  },
  {
    id: "akun",
    label: "Akun",
    items: [
      { id: "profil", label: "Profil Saya", icon: "user", href: "/profile", loginOnly: true },
      { id: "kyc", label: "Verifikasi Akun", icon: "id_card", href: "/kyc", loginOnly: true },
      {
        id: "notifikasi",
        label: "Pemberitahuan",
        icon: "bell",
        href: "/notifications",
        loginOnly: true,
        badge: "notifications",
      },
      { id: "pengaturan", label: "Pengaturan", icon: "settings", href: "/settings", loginOnly: true },
      { id: "bantuan", label: "Bantuan", icon: "help", href: "/bantuan", badge: "support" },
    ],
  },
];

export const USER_ADMIN_MENU_ITEM: UserMenuItem = {
  id: "panel-admin",
  label: "Panel Admin",
  icon: "lock",
  href: "/admin",
  adminOnly: true,
};

export type UserMenuVisibility = {
  loggedIn: boolean;
  isAdmin: boolean;
  scanQrisEnabled: boolean;
};

export function filterUserMenuGroups(groups: UserMenuGroup[], visibility: UserMenuVisibility): UserMenuGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && !visibility.isAdmin) return false;
        if (item.loginOnly && !visibility.loggedIn) return false;
        if (item.feature === "scan_qris" && !visibility.scanQrisEnabled) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function flattenUserMenu(groups: UserMenuGroup[]): UserMenuItem[] {
  return groups.flatMap((group) => group.items);
}

/** Item aktif paling spesifik; "/" hanya aktif di beranda. */
export function userActiveHref(pathname: string, groups: UserMenuGroup[] = USER_MENU_GROUPS): string {
  let best = "";
  for (const item of flattenUserMenu(groups)) {
    if (item.href === "/") {
      if (pathname === "/") return "/";
      continue;
    }
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (active && item.href.length > best.length) best = item.href;
  }
  return best;
}
