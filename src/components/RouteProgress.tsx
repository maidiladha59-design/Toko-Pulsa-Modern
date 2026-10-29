"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Progress bar tipis di atas layar untuk memberi umpan balik instan saat
 * navigasi dimulai. Selesai otomatis ketika pathname berubah.
 *
 * App Router tidak punya event navigasi, jadi pemicunya adalah klik pada link
 * internal dan pemanggilan history.pushState/replaceState (dipakai router.push).
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [value, setValue] = useState(0);
  const creep = useRef<number | null>(null);
  const safety = useRef<number | null>(null);
  const pending = useRef(false);
  const lastPath = useRef(pathname);

  useEffect(() => {
    const stop = () => {
      if (creep.current) window.clearInterval(creep.current);
      if (safety.current) window.clearTimeout(safety.current);
      creep.current = null;
      safety.current = null;
    };

    const start = () => {
      if (creep.current) return;
      pending.current = true;
      setActive(true);
      setValue(12);
      creep.current = window.setInterval(() => {
        setValue((v) => (v >= 90 ? v : v + Math.max(1, (90 - v) / 7)));
      }, 160);
      // Jangan biarkan bar menggantung kalau navigasi dibatalkan.
      safety.current = window.setTimeout(() => {
        stop();
        pending.current = false;
        setValue(0);
        setActive(false);
      }, 8000);
    };

    const isModified = (event: MouseEvent) =>
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

    const onClick = (event: MouseEvent) => {
      if (isModified(event)) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (href.split("#")[0].split("?")[0] === pathname) return;
      start();
    };

    const wrap = (name: "pushState" | "replaceState") => {
      const original = history[name].bind(history);
      return ((...args: Parameters<History["pushState"]>) => {
        const url = String(args[2] ?? "");
        if (url.startsWith("/") && url.split("?")[0] !== pathname) start();
        return original(...args);
      }) as History[typeof name];
    };

    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    history.pushState = wrap("pushState");
    history.replaceState = wrap("replaceState");

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      stop();
    };
  }, [pathname]);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (!pending.current) return;
    pending.current = false;
    if (creep.current) window.clearInterval(creep.current);
    if (safety.current) window.clearTimeout(safety.current);
    creep.current = null;
    safety.current = null;
    setValue(100);
    const hide = window.setTimeout(() => {
      setActive(false);
      setValue(0);
    }, 220);
    return () => window.clearTimeout(hide);
  }, [pathname]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      data-route-progress
      className="pointer-events-none fixed inset-x-0 top-0 z-[1050] h-[3px] bg-transparent"
    >
      <div
        className="h-full bg-brand-gradient transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${value}%`, opacity: value >= 100 ? 0 : 1 }}
      />
    </div>
  );
}
