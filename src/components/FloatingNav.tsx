"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/icons/Icon";

export type FloatingNavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

export type FloatingNavAction = {
  label: string;
  icon: string;
  active?: boolean;
  badge?: number;
  ariaLabel?: string;
  onClick: () => void;
};

type Props = {
  items: FloatingNavItem[];
  isActive: (href: string) => boolean;
  action?: FloatingNavAction;
  /** Sembunyikan nav tanpa animasi keyboard (mis. halaman checkout). */
  hidden?: boolean;
  ariaLabel?: string;
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
    <span className="floating-nav-badge" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function FloatingNav({ items, isActive, action, hidden = false, ariaLabel = "Navigasi utama" }: Props) {
  const keyboardOpen = useKeyboardOpen();

  return (
    <nav className="floating-nav" aria-label={ariaLabel} data-hidden={hidden || keyboardOpen ? "true" : "false"}>
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="floating-nav-item"
            data-active={active ? "true" : "false"}
            aria-current={active ? "page" : undefined}
          >
            <span className="floating-nav-icon">
              <Icon name={item.icon} size={24} />
              <Badge count={item.badge} />
            </span>
            <span className="floating-nav-label">{item.label}</span>
          </Link>
        );
      })}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="floating-nav-item"
          data-active={action.active ? "true" : "false"}
          aria-label={action.ariaLabel ?? action.label}
          aria-expanded={action.active || undefined}
        >
          <span className="floating-nav-icon">
            <Icon name={action.icon} size={24} />
            <Badge count={action.badge} />
          </span>
          <span className="floating-nav-label">{action.label}</span>
        </button>
      ) : null}
    </nav>
  );
}
