"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Icon from "@/components/icons/Icon";
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

function readStored(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeStored(key: string, value: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage bisa diblokir (mode privat); menu tetap berfungsi tanpa simpanan.
  }
}

function badgeValue(badges: AdminBadgeCounts, item: AdminMenuItem) {
  if (!item.badge) return 0;
  const value = Number(badges[item.badge] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export default function AdminSidebar({ groups, badges, adminId, variant = "desktop", onNavigate, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [stored, setStored] = useState(false);
  const [loading, setLoading] = useState(false);

  const favKey = `aidil_admin_favs_v1_${adminId}`;
  const collapseKey = `aidil_admin_groups_v1_${adminId}`;
  const activeHref = adminActiveHref(pathname, groups);
  const activeGroup = groups.find((group) => group.items.some((item) => item.href === activeHref))?.key || "";
  const searching = query.trim().length > 0;

  useEffect(() => {
    setFavorites(readStored(favKey));
    setCollapsed(readStored(collapseKey));
    setStored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favKey, collapseKey]);

  useEffect(() => {
    if (!stored || !activeGroup) return;
    setCollapsed((current) => {
      if (!current.includes(activeGroup)) return current;
      const next = current.filter((key) => key !== activeGroup);
      writeStored(collapseKey, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, stored]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(q)) }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const favoriteItems = useMemo(() => {
    if (searching) return [];
    const all = groups.flatMap((group) => group.items);
    return favorites.map((href) => all.find((item) => item.href === href)).filter(Boolean) as AdminMenuItem[];
  }, [favorites, groups, searching]);

  function toggleFavorite(href: string) {
    setFavorites((current) => {
      const next = current.includes(href) ? current.filter((item) => item !== href) : [...current, href];
      writeStored(favKey, next);
      return next;
    });
  }

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      writeStored(collapseKey, next);
      return next;
    });
  }

  async function logout() {
    setLoading(true);
    await createClient().auth.signOut();
    router.replace("/admin-login");
    router.refresh();
  }

  function go() {
    onNavigate?.();
  }

  return (
    <aside
      className={
        variant === "drawer"
          ? "flex h-full flex-col bg-app-bg"
          : "overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-sm"
      }
    >
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

      <div className="border-b border-app-border p-3">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-subtle">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari menu..."
            aria-label="Cari menu admin"
            className="w-full rounded-xl border border-app-border bg-app-inset py-2.5 pl-9 pr-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
          />
        </label>
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {favoriteItems.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[10px] font-black uppercase tracking-widest text-app-kicker">
              <Icon name="star_fill" size={12} /> Favorit
            </p>
            <div className="space-y-0.5">
              {favoriteItems.map((item) => (
                <MenuRow
                  key={`fav-${item.href}`}
                  item={item}
                  active={item.href === activeHref}
                  favorite
                  count={badgeValue(badges, item)}
                  onFavorite={() => toggleFavorite(item.href)}
                  onNavigate={go}
                />
              ))}
            </div>
          </div>
        )}

        {filteredGroups.map((group) => {
          const open = searching || !collapsed.includes(group.key);
          const hasActive = group.items.some((item) => item.href === activeHref);
          return (
            <section key={group.key}>
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                aria-expanded={open}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] font-black uppercase tracking-widest transition ${
                  hasActive ? "text-app-kicker" : "text-app-subtle hover:text-app-text"
                }`}
              >
                <span className="min-w-0 flex-1 break-words">{group.label}</span>
                {hasActive && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />}
                <Icon name="chevron_down" size={13} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
              </button>
              {open && (
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <MenuRow
                      key={item.href}
                      item={item}
                      active={item.href === activeHref}
                      favorite={favorites.includes(item.href)}
                      count={badgeValue(badges, item)}
                      onFavorite={() => toggleFavorite(item.href)}
                      onNavigate={go}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {filteredGroups.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-app-muted">Menu tidak ditemukan</p>
        )}
      </nav>

      <div className="border-t border-app-border p-2.5">
        <button
          disabled={loading}
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-danger-600 transition hover:bg-danger-500/10 disabled:opacity-60 dark:text-danger-400"
        >
          <Icon name="logout" size={18} />
          {loading ? "Keluar..." : "Keluar"}
        </button>
      </div>
    </aside>
  );
}

function MenuRow({
  item,
  active,
  favorite,
  count,
  onFavorite,
  onNavigate,
}: {
  item: AdminMenuItem;
  active: boolean;
  favorite: boolean;
  count: number;
  onFavorite: () => void;
  onNavigate: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-0.5 rounded-xl transition ${
        active ? "bg-gold-400/15" : "hover:bg-app-accent-soft"
      }`}
    >
      <Link
        href={item.href}
        onClick={onNavigate}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
          active ? "font-black text-app-kicker" : "font-bold text-app-muted hover:text-app-text"
        }`}
      >
        <Icon name={item.icon} size={17} className="shrink-0" />
        <span className="min-w-0 flex-1 break-words">{item.label}</span>
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-danger-500/15 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-danger-600 dark:text-danger-400">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={onFavorite}
        aria-label={favorite ? `Hapus ${item.label} dari favorit` : `Sematkan ${item.label} ke favorit`}
        aria-pressed={favorite}
        className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition ${
          favorite ? "text-gold-500 dark:text-gold-300" : "text-app-subtle/70 hover:bg-app-inset hover:text-gold-500"
        }`}
      >
        <Icon name={favorite ? "star_fill" : "star"} size={14} />
      </button>
    </div>
  );
}
