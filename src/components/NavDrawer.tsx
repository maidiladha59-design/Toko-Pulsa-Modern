"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";

export type NavDrawerItem = {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  badge?: number;
  emphasis?: boolean;
};

export type NavDrawerGroup = {
  id: string;
  label: string;
  items: NavDrawerItem[];
};

export type NavDrawerContentProps = {
  header: ReactNode;
  groups: NavDrawerGroup[];
  activeHref: string;
  favoritesKey: string;
  collapsedKey: string;
  footer?: ReactNode;
  accountBlock?: ReactNode;
  pinnedItems?: NavDrawerItem[];
  searchPlaceholder?: string;
  emptyText?: string;
  navLabel?: string;
  onNavigate?: () => void;
  dense?: boolean;
  className?: string;
};

export type NavDrawerProps = NavDrawerContentProps & {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  panelId?: string;
  maxWidthClass?: string;
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
    // Mode privat / storage diblokir: menu tetap berfungsi tanpa simpanan.
  }
}

export function NavDrawerContent({
  header,
  groups,
  activeHref,
  favoritesKey,
  collapsedKey,
  footer,
  accountBlock,
  pinnedItems = [],
  searchPlaceholder = "Cari menu...",
  emptyText = "Menu tidak ditemukan",
  navLabel = "Menu navigasi",
  onNavigate,
  dense = false,
  className = "",
}: NavDrawerContentProps) {
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [stored, setStored] = useState(false);

  useEffect(() => {
    setFavorites(readStored(favoritesKey));
    setCollapsed(readStored(collapsedKey));
    setStored(true);
  }, [favoritesKey, collapsedKey]);

  const activeGroup = groups.find((group) => group.items.some((item) => item.href === activeHref))?.id || "";

  useEffect(() => {
    if (!stored || !activeGroup) return;
    setCollapsed((current) => {
      if (!current.includes(activeGroup)) return current;
      const next = current.filter((key) => key !== activeGroup);
      writeStored(collapsedKey, next);
      return next;
    });
  }, [activeGroup, collapsedKey, stored]);

  const searching = query.trim().length > 0;
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
    return favorites.map((href) => all.find((item) => item.href === href)).filter(Boolean) as NavDrawerItem[];
  }, [favorites, groups, searching]);

  function toggleFavorite(href: string) {
    setFavorites((current) => {
      const next = current.includes(href) ? current.filter((item) => item !== href) : [...current, href];
      writeStored(favoritesKey, next);
      return next;
    });
  }

  function toggleGroup(key: string) {
    setCollapsed((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      writeStored(collapsedKey, next);
      return next;
    });
  }

  function navigate() {
    onNavigate?.();
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="shrink-0">{header}</div>

      {accountBlock ? <div className="shrink-0 px-3 pt-3">{accountBlock}</div> : null}

      <div className="shrink-0 border-b border-app-border p-3">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-subtle">
            <Icon name="search" size={16} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label="Cari menu"
            className="w-full rounded-xl border border-app-border bg-app-inset py-2.5 pl-9 pr-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
          />
        </label>
      </div>

      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5" aria-label={navLabel}>
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
                  dense={dense}
                  onFavorite={() => toggleFavorite(item.href)}
                  onNavigate={navigate}
                />
              ))}
            </div>
          </div>
        )}

        {filteredGroups.map((group) => {
          const open = searching || !collapsed.includes(group.id);
          const hasActive = group.items.some((item) => item.href === activeHref);
          return (
            <section key={group.id}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
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
                      dense={dense}
                      onFavorite={() => toggleFavorite(item.href)}
                      onNavigate={navigate}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {filteredGroups.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-app-muted">{emptyText}</p>
        )}
      </nav>

      {pinnedItems.length > 0 && (
        <div className="shrink-0 space-y-0.5 border-t border-app-border p-2.5">
          {pinnedItems.map((item) => (
            <MenuRow
              key={item.href}
              item={item}
              active={item.href === activeHref}
              favorite={favorites.includes(item.href)}
              dense={dense}
              onFavorite={() => toggleFavorite(item.href)}
              onNavigate={navigate}
            />
          ))}
        </div>
      )}

      {footer ? <div className="shrink-0 border-t border-app-border p-2.5">{footer}</div> : null}
    </div>
  );
}

function MenuRow({
  item,
  active,
  favorite,
  dense,
  onFavorite,
  onNavigate,
}: {
  item: NavDrawerItem;
  active: boolean;
  favorite: boolean;
  dense: boolean;
  onFavorite: () => void;
  onNavigate: () => void;
}) {
  const highlighted = active || item.emphasis;
  return (
    <div className={`flex items-center gap-0.5 rounded-xl transition ${highlighted ? "" : "hover:bg-app-accent-soft"}`}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        style={
          highlighted
            ? { backgroundColor: "rgb(var(--theme-primary-rgb) / 0.14)", color: "var(--primary)" }
            : undefined
        }
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl ${
          dense ? "min-h-9 px-2.5 py-2" : "min-h-12 px-3 py-2.5"
        } text-sm transition ${highlighted ? "font-black" : "font-bold text-app-muted hover:text-app-text"}`}
      >
        <Icon name={item.icon} size={dense ? 17 : 18} className="shrink-0" />
        <span className="min-w-0 flex-1 break-words">{item.label}</span>
        {item.badge && item.badge > 0 ? (
          <span className="shrink-0 rounded-full bg-danger-500/15 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-danger-600 dark:text-danger-400">
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
      <button
        type="button"
        onClick={onFavorite}
        aria-label={favorite ? `Hapus ${item.label} dari favorit` : `Sematkan ${item.label} ke favorit`}
        aria-pressed={favorite}
        className={`mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
          favorite ? "text-gold-500 dark:text-gold-300" : "text-app-subtle/70 hover:bg-app-inset hover:text-gold-500"
        }`}
      >
        <Icon name={favorite ? "star_fill" : "star"} size={14} />
      </button>
    </div>
  );
}

export default function NavDrawer({
  open,
  onClose,
  ariaLabel,
  panelId,
  maxWidthClass = "max-w-[360px]",
  ...content
}: NavDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(open);
  const [entered, setEntered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const touchRef = useRef<{ x: number; y: number; axis: "none" | "x" | "y" } | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setVisible(true);
      const frame = window.requestAnimationFrame(() => setEntered(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setEntered(false);
    setDragX(0);
    const timer = window.setTimeout(() => setVisible(false), 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("button, a[href], input")?.focus();
    }, 30);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => node.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (restoreRef.current?.isConnected) restoreRef.current.focus();
    };
  }, [open]);

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    touchRef.current = { x: touch.clientX, y: touch.clientY, axis: "none" };
    setDragging(true);
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchRef.current;
    const touch = event.touches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (start.axis === "none") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (start.axis !== "x") return;
    setDragX(Math.min(0, dx));
  }

  function handleTouchEnd() {
    if (dragX < -72) closeRef.current();
    setDragX(0);
    setDragging(false);
    touchRef.current = null;
  }

  if (!mounted || !visible) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] lg:hidden" role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button
        type="button"
        aria-label="Tutup menu"
        onClick={onClose}
        style={{ backgroundColor: "var(--hero-bg-from)", opacity: entered ? 0.68 : 0 }}
        className="absolute inset-0 h-full w-full transition-opacity duration-200 motion-reduce:transition-none"
      />
      <div
        id={panelId}
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={dragX < 0 ? { transform: `translateX(${dragX}px)` } : undefined}
        className={`absolute inset-y-0 left-0 z-[1001] flex h-[100dvh] w-[86vw] ${maxWidthClass} flex-col overflow-hidden border-r border-app-border bg-app-bg shadow-2xl ${
          entered ? "translate-x-0" : "-translate-x-full"
        } ${dragging ? "" : "transition-transform duration-200 ease-out motion-reduce:transition-none"}`}
      >
        <NavDrawerContent {...content} />
      </div>
    </div>,
    document.body
  );
}
