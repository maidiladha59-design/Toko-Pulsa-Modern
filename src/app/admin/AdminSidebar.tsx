"use client";

import Image from "next/image";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/icons/Icon";
import { resolveIconName } from "@/components/icons/registry";
import { NavDrawerContent, type NavDrawerGroup } from "@/components/NavDrawer";
import {
  adminActiveHref,
  type AdminBadgeCounts,
  type AdminMenuGroup,
  type AdminMenuItem,
} from "@/lib/admin-menu";

type Props = {
  groups: AdminMenuGroup[];
  badges: AdminBadgeCounts;
  adminId: string;
  variant?: "desktop" | "drawer";
  onNavigate?: () => void;
  onClose?: () => void;
};

function badgeValue(badges: AdminBadgeCounts, item: AdminMenuItem) {
  if (!item.badge) return undefined;
  const value = Number(badges[item.badge] || 0);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export default function AdminSidebar({ groups, badges, adminId, variant = "desktop", onNavigate, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const activeHref = adminActiveHref(pathname, groups);
  const drawerGroups: NavDrawerGroup[] = groups.map((group) => ({
    id: group.key,
    label: group.label,
    items: group.items.map((item) => ({
      id: item.href,
      href: item.href,
      icon: resolveIconName(item.icon),
      label: item.label,
      badge: badgeValue(badges, item),
    })),
  }));

  async function logout() {
    setLoading(true);
    await createClient().auth.signOut();
    router.replace("/admin-login");
    router.refresh();
  }

  const header = (
    <div className="app-hero flex items-center gap-3 border-b border-white/10 p-4 text-white">
      <Image src="/aidil-logo.png" alt="Logo AIDIL STORE" width={40} height={40} className="h-10 w-10 rounded-xl bg-white p-1" />
      <div className="min-w-0 flex-1">
        <p className="break-words font-black leading-5">AIDIL STORE</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-gold-200">Panel Admin</p>
      </div>
      {variant === "drawer" && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );

  const footer = (
    <button
      disabled={loading}
      onClick={logout}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-danger-600 transition hover:bg-danger-500/10 disabled:opacity-60 dark:text-danger-400"
    >
      <Icon name="logout" size={18} />
      {loading ? "Keluar..." : "Keluar"}
    </button>
  );

  const content = (
    <NavDrawerContent
      header={header}
      groups={drawerGroups}
      activeHref={activeHref}
      favoritesKey={`aidil_admin_favs_v1_${adminId}`}
      collapsedKey={`aidil_admin_groups_v1_${adminId}`}
      footer={footer}
      searchPlaceholder="Cari menu..."
      emptyText="Menu tidak ditemukan"
      navLabel="Menu admin"
      dense
      onNavigate={onNavigate}
    />
  );

  if (variant === "drawer") return content;

  return (
    <aside className="overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-sm">
      {content}
    </aside>
  );
}
