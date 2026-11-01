"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Icon from "@/components/icons/Icon";
import FloatingNav from "@/components/FloatingNav";
import AdminSidebar from "./AdminSidebar";
import {
  adminActiveHref,
  adminPageTitle,
  type AdminBadgeCounts,
  type AdminMenuGroup,
} from "@/lib/admin-menu";

type Props = {
  groups: AdminMenuGroup[];
  badges: AdminBadgeCounts;
  adminId: string;
  children: React.ReactNode;
};

const BOTTOM_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "chart_bar" },
  { href: "/admin/orders", label: "Pesanan", icon: "receipt" },
  { href: "/admin/users", label: "Pengguna", icon: "users" },
];

export default function AdminShell({ groups, badges, adminId, children }: Props) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const title = adminPageTitle(pathname);
  const activeHref = adminActiveHref(pathname, groups);
  const allowedHrefs = new Set(groups.flatMap((group) => group.items.map((item) => item.href)));
  const bottomItems = BOTTOM_ITEMS.filter((item) => allowedHrefs.has(item.href));
  const navItems = bottomItems.map((item) => ({
    ...item,
    badge: item.href === "/admin/orders" ? badges.orders : item.href === "/admin/users" ? badges.kyc : undefined,
  }));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 -mx-4 mb-5 border-b border-app-border bg-app-bg/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu admin"
            aria-expanded={drawerOpen}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-app-border bg-app-surface text-app-text transition hover:bg-app-inset md:hidden"
          >
            <Icon name="menu" size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-app-kicker">Panel Admin</p>
            <h1 className="break-words text-base font-black leading-5 text-app-text sm:text-lg">{title}</h1>
          </div>
          <Link
            href="/"
            className="btn-gold flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-black transition"
          >
            <Icon name="home" size={15} /> Lihat Toko
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 pb-6 md:grid-cols-[240px_1fr] md:items-start md:pb-6">
        <aside className="hidden md:sticky md:top-[69px] md:block md:max-h-[calc(100dvh-89px)] md:overflow-y-auto">
          <AdminSidebar groups={groups} badges={badges} adminId={adminId} />
        </aside>
        <section className="min-w-0">{children}</section>
      </div>

      <FloatingNav
        items={navItems}
        isActive={(href) => activeHref === href}
        action={{ label: "Menu", icon: "menu", active: drawerOpen, ariaLabel: "Buka menu admin", onClick: () => setDrawerOpen(true) }}
        ariaLabel="Navigasi admin"
      />

      {mounted && drawerOpen && createPortal(
        <div className="fixed inset-0 z-[900] md:hidden" role="dialog" aria-modal="true" aria-label="Menu admin">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full bg-zinc-950/60 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 z-[901] flex w-[86vw] max-w-[320px] animate-page-in flex-col overflow-y-auto border-r border-app-border bg-app-bg shadow-2xl">
            <AdminSidebar
              groups={groups}
              badges={badges}
              adminId={adminId}
              variant="drawer"
              onClose={() => setDrawerOpen(false)}
              onNavigate={() => setDrawerOpen(false)}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
