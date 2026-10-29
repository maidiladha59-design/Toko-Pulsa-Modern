"use client";

import Link from "next/link";
import NavIcon from "@/components/NavIcon";
import { tickerShouldRender, type InfoTickerSettings, type TickerStyle } from "@/lib/info-ticker";
import { useEffect, useRef, useState } from "react";

// Baris info berjalan di dalam kartu hero. Teks dianggap teks biasa: tidak
// pernah dirender sebagai HTML, jadi tidak ada jalur XSS dari pengaturan admin.
//
// Cara kerja: track berisi dua salinan teks identik. Selama satu salinan lebih
// lebar dari viewport, track digeser 0 -> -50% (selebar satu salinan) sehingga
// loop terasa tanpa jahitan. Durasi = lebar salinan / kecepatan (px per detik)
// dan dihitung ulang lewat ResizeObserver saat ukuran berubah.

const TEXT_STYLES: Record<TickerStyle, string> = {
  default: "text-white",
  emas: "text-gold-200",
  peringatan: "text-warning-300",
};

const ICON_STYLES: Record<TickerStyle, string> = {
  default: "text-gold-400",
  emas: "text-gold-300",
  peringatan: "text-warning-400",
};

export default function InfoTicker({
  settings,
  previewMode = false,
}: {
  settings: InfoTickerSettings;
  /** Pratinjau admin: abaikan switch aktif & jadwal, tetap sembunyi saat teks kosong. */
  previewMode?: boolean;
}) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [singleWidth, setSingleWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);

  // prefers-reduced-motion: tidak ada animasi, teks boleh dua baris.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const text = settings.text.trim();
  const gap = settings.gap;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const first = trackRef.current?.firstElementChild;
      setViewportWidth(viewport.getBoundingClientRect().width);
      setSingleWidth(first ? first.getBoundingClientRect().width : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    const first = trackRef.current?.firstElementChild;
    if (first) observer.observe(first);
    return () => observer.disconnect();
  }, [text, gap]);

  if (!text) return null;
  if (!previewMode && !tickerShouldRender(settings)) return null;

  const overflowing = singleWidth > viewportWidth + 1;
  const animated = !reduced && overflowing;
  const duration = animated ? Math.max(1, Math.round((singleWidth / settings.speed) * 10) / 10) : 0;

  const href = settings.link_url || "/notifications";
  const external = /^https:\/\//i.test(href);
  const textClass = TEXT_STYLES[settings.style];
  const iconClass = ICON_STYLES[settings.style];

  const pause = () => {
    if (settings.pause_on_touch) setPaused(true);
  };
  const resume = () => {
    if (settings.pause_on_touch) setPaused(false);
  };

  const shellClass =
    "group flex h-10 min-w-0 items-center gap-2 rounded-lg px-1 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400 active:opacity-80";

  const leadingIcon =
    settings.icon === "none" ? null : (
      <NavIcon name={settings.icon} className={`h-[18px] w-[18px] shrink-0 ${iconClass}`} />
    );

  const body = (
    <>
      {leadingIcon}
      <span ref={viewportRef} className="info-ticker-viewport relative min-w-0 flex-1 overflow-hidden">
        {reduced ? (
          <span className={`line-clamp-2 whitespace-normal text-sm leading-5 ${textClass}`}>{text}</span>
        ) : (
          <span
            ref={trackRef}
            className={animated ? "info-ticker-track flex w-max" : "flex w-max"}
            style={
              animated
                ? {
                    animationName: settings.direction === "right" ? "info-ticker-right" : "info-ticker-left",
                    animationDuration: `${duration}s`,
                    animationPlayState: paused ? "paused" : "running",
                  }
                : undefined
            }
          >
            <span className="whitespace-nowrap text-sm leading-5" style={{ paddingRight: gap }}>
              {text}
            </span>
            <span aria-hidden className="whitespace-nowrap text-sm leading-5" style={{ paddingRight: gap }}>
              {text}
            </span>
          </span>
        )}
      </span>
    </>
  );

  const interaction = {
    onMouseEnter: pause,
    onMouseLeave: resume,
    onFocus: pause,
    onBlur: resume,
    onTouchStart: pause,
    onTouchEnd: resume,
  };

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={shellClass} {...interaction}>
        {body}
      </a>
    );
  }

  return (
    <Link href={href} className={shellClass} {...interaction}>
      {body}
    </Link>
  );
}
