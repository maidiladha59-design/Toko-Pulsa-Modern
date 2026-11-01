"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Icon from "@/components/icons/Icon";
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
            className="btn-gold flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-black text-zinc-950 transition"
          >
            <Icon name="home" size={15} /> Lihat Toko
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 pb-24 md:grid-cols-[240px_1fr] md:items-start md:pb-6">
        <aside className="hidden md:sticky md:top-[69px] md:block md:max-h-[calc(100dvh-89px)] md:overflow-y-auto">
          <AdminSidebar groups={groups} badges={badges} adminId={adminId} />
        </aside>
        <section className="min-w-0">{children}</section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-[60] border-t border-app-border bg-app-bg/95 pt-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,.08)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-lg">
          {bottomItems.map((item) => {
            const active = activeHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition ${
                  active ? "text-app-kicker" : "text-app-muted"
                }`}
              >
                <span
                  className={`flex h-7 min-w-[38px] items-center justify-center rounded-full px-2 transition ${
                    active ? "bg-gold-400/15" : ""
                  }`}
                >
                  <Icon name={item.icon} size={17} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu admin"
            aria-expanded={drawerOpen}
            className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-bold transition ${
              drawerOpen ? "text-app-kicker" : "text-app-muted"
            }`}
          >
            <span
              className={`flex h-7 min-w-[38px] items-center justify-center rounded-full px-2 transition ${
                drawerOpen ? "bg-gold-400/15" : ""
              }`}
            >
              <Icon name="menu" size={17} />
            </span>
            <span>Menu</span>
          </button>
        </div>
      </nav>

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
