"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/icons/Icon";

export default function CopyButton({
  value,
  label = "Salin",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Tersalin" : `${label} ${value}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-app-border bg-app-inset px-2 py-1 text-[11px] font-bold text-app-muted transition hover:border-gold-400/60 hover:text-app-kicker ${className}`}
    >
      <Icon name={copied ? "check" : "copy"} size={13} />
      {copied ? "Tersalin" : label}
    </button>
  );
}
