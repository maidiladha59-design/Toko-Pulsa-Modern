"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import Icon from "@/components/icons/Icon";
import {
  BOTTOM_NAV_MENU_TARGET,
  bottomNavEffectiveVariant,
  isBottomNavTargetActive,
  type BottomNavItem,
  type BottomNavSettings,
} from "@/lib/bottom-nav";

type Props = {
  settings: BottomNavSettings;
  /** Path saat ini untuk menentukan item aktif (termasuk sub-halaman). */
  pathname?: string;
  /** Lencana per tujuan, mis. { "/admin/orders": 3 }. */
  badges?: Record<string, number>;
  /** Sembunyikan nav tanpa animasi keyboard (mis. halaman checkout). */
  hidden?: boolean;
  ariaLabel?: string;
  /** Status menu lengkap sedang terbuka (item tujuan "menu"). */
  menuOpen?: boolean;
  onMenu?: () => void;
  /** Pratinjau admin: item jadi tombol dan menandai target aktif lokal. */
  previewActive?: string;
  onSelect?: (item: BottomNavItem) => void;
  /** Pratinjau di dalam bingkai: tidak fixed dan tetap tampil di layar lebar. */
  embedded?: boolean;
  /** Kartu galeri yang sempit: label diperkecil agar tetap utuh, tanpa elipsis. */
  compact?: boolean;
};

const HEIGHT_PX: Record<BottomNavSettings["height"], number> = {
  ringkas: 56,
  normal: 64,
  besar: 72,
};

// Nav disembunyikan saat keyboard virtual terbuka: visualViewport menyusut
// jauh dari tinggi layout, atau fokus berada di kontrol input.
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    const inputFocused = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const update = () => {
      const shrunk = viewport ? window.innerHeight - viewport.height > 140 : false;
      setOpen(shrunk || inputFocused());
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  return open;
}

function Badge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span className="bottom-nav-badge" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function bottomSpace(variant: BottomNavSettings["variant"], height: number): number {
  if (variant === "tengah") return height + 16 + 28;
  if (variant === "kotak" || variant === "garis") return height + 16;
  return height + 24 + 12;
}

export default function BottomNav({
  settings,
  pathname = "",
  badges = {},
  hidden = false,
  ariaLabel = "Navigasi utama",
  menuOpen = false,
  onMenu,
  previewActive,
  onSelect,
  embedded = false,
  compact = false,
}: Props) {
  const keyboardOpen = useKeyboardOpen();
  const preview = typeof onSelect === "function";
  const variant = bottomNavEffectiveVariant(settings);
  const items = settings.items.filter((item) => item.visible);
  const showLabels = variant === "ikon" ? false : settings.show_labels;
  const height = HEIGHT_PX[settings.height] ?? 64;

  const isActive = (item: BottomNavItem) => {
    if (preview) return item.target === previewActive;
    if (item.target === BOTTOM_NAV_MENU_TARGET) return menuOpen;
    return isBottomNavTargetActive(item.target, pathname);
  };

  const activeIndex = items.findIndex(isActive);
  const slide =
    settings.animate &&
    settings.active_effect === "slide" &&
    (variant === "kapsul" || variant === "kaca") &&
    activeIndex >= 0;

  function handleSelect(item: BottomNavItem) {
    if (settings.haptic) {
      try {
        navigator.vibrate?.(8);
      } catch {
        // Getaran tidak didukung; abaikan.
      }
    }
    onSelect?.(item);
  }

  const content = items.map((item) => {
    const active = isActive(item);
    const isCenter = variant === "tengah" && item.center;
    const className = `bottom-nav-item${isCenter ? " bottom-nav-item--center" : ""}`;
    const inner = (
      <>
        <span className="bottom-nav-icon">
          <Icon name={item.icon} size={24} />
          <Badge count={badges[item.target]} />
        </span>
        <span className="bottom-nav-label">{item.label}</span>
      </>
    );

    if (preview) {
      return (
        <button
          key={item.id}
          type="button"
          className={className}
          data-active={active ? "true" : "false"}
          aria-current={active ? "page" : undefined}
          aria-label={item.label}
          onClick={() => handleSelect(item)}
        >
          {inner}
        </button>
      );
    }

    if (item.target === BOTTOM_NAV_MENU_TARGET) {
      return (
        <button
          key={item.id}
          type="button"
          className={className}
          data-active={active ? "true" : "false"}
          aria-label={item.label}
          aria-expanded={menuOpen || undefined}
          onClick={() => {
            handleSelect(item);
            onMenu?.();
          }}
        >
          {inner}
        </button>
      );
    }

    return (
      <Link
        key={item.id}
        href={item.target}
        className={className}
        data-active={active ? "true" : "false"}
        aria-current={active ? "page" : undefined}
        onClick={() => handleSelect(item)}
      >
        {inner}
      </Link>
    );
  });

  return (
    <>
      {!embedded && (
        <style
          dangerouslySetInnerHTML={{
            __html: `@media (max-width:767px){body{padding-bottom:calc(${bottomSpace(
              variant,
              height
            )}px + env(safe-area-inset-bottom))}}`,
          }}
        />
      )}
      <nav
        className="bottom-nav"
        aria-label={ariaLabel}
        data-variant={variant}
        data-radius={settings.radius}
        data-labels={showLabels ? "true" : "false"}
        data-animate={settings.animate ? "true" : "false"}
        data-accent={settings.accent}
        data-embedded={embedded ? "true" : "false"}
        data-compact={compact ? "true" : "false"}
        data-hidden={!embedded && (hidden || keyboardOpen) ? "true" : "false"}
        style={{ "--nav-height": `${height}px` } as CSSProperties}
      >
        {slide && (
          <span className="bottom-nav-slider" aria-hidden>
            <span
              className="bottom-nav-slider-thumb"
              style={{
                width: `calc(100% / ${items.length})`,
                transform: `translateX(${activeIndex * 100}%)`,
              }}
            />
          </span>
        )}
        {content}
      </nav>
    </>
  );
}
