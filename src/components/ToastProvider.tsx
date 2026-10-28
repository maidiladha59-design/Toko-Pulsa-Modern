"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind) => void }>({
  show: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const TITLES: Record<ToastKind, string> = {
  success: "Berhasil",
  error: "Gagal",
  info: "Informasi",
};

const ACCENTS: Record<ToastKind, { bg: string; fg: string; glow: string }> = {
  success: { bg: "#16A34A", fg: "#FFFFFF", glow: "0 12px 30px rgba(22, 163, 74, .35)" },
  error: { bg: "#DC2626", fg: "#FFFFFF", glow: "0 12px 30px rgba(220, 38, 38, .35)" },
  info: { bg: "#2E9EF5", fg: "#071F45", glow: "0 12px 30px rgba(46, 158, 245, .35)" },
};

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "success") {
    return (
      <svg viewBox="0 0 52 52" aria-hidden="true" className="h-12 w-12">
        <path
          d="M12 27.5 21.5 37 40 14"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="toast-icon-draw"
        />
      </svg>
    );
  }
  if (kind === "error") {
    return (
      <svg viewBox="0 0 52 52" aria-hidden="true" className="h-12 w-12">
        <path
          d="M15 15 37 37"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={4.5}
          strokeLinecap="round"
          pathLength={1}
          className="toast-icon-draw"
        />
        <path
          d="M37 15 15 37"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={4.5}
          strokeLinecap="round"
          pathLength={1}
          className="toast-icon-draw toast-icon-draw-2"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 52 52" aria-hidden="true" className="h-12 w-12">
      <circle cx="26" cy="14.5" r="2.8" fill="#09090B" />
      <path d="M26 23v15" stroke="#09090B" strokeWidth={4.5} strokeLinecap="round" />
    </svg>
  );
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Toast[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  const current = queue[0];
  const currentId = current?.id ?? null;

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    // Antrean: hanya satu modal tampil, sisanya menunggu tombol OK ditekan.
    setQueue((prev) => [...prev, { id, message, kind }]);
  }, []);

  const dismiss = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  useEffect(() => {
    if (currentId === null) return;
    okRef.current?.focus({ preventScroll: true });
  }, [currentId]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Escape tidak boleh menutup notifikasi; satu-satunya jalan keluar adalah OK.
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      okRef.current?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Ditangani eksplisit agar Enter/Space selalu menekan OK tanpa dobel klik.
      event.preventDefault();
      if (!event.repeat) dismiss();
    }
  }

  const accent = current ? ACCENTS[current.kind] : null;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {current && accent && (
        <div
          key={current.id}
          className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-black/60 p-4"
        >
          <div className="toast-modal-in w-full max-w-sm">
            <div
              role={current.kind === "error" ? "alertdialog" : "dialog"}
              aria-modal="true"
              aria-labelledby="toast-title"
              aria-describedby="toast-desc"
              onKeyDown={handleKeyDown}
              className={`max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-3xl border border-app-border bg-app-surface p-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-7 ${
                current.kind === "error" ? "toast-error-shake" : ""
              }`}
            >
              <div
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
                style={{ backgroundColor: accent.bg, boxShadow: accent.glow }}
              >
                <ToastIcon kind={current.kind} />
              </div>
              <h2 id="toast-title" className="mt-5 text-xl font-black tracking-tight text-app-text">
                {TITLES[current.kind]}
              </h2>
              <p
                id="toast-desc"
                className="mt-2 whitespace-pre-line break-words text-sm font-medium leading-6 text-app-muted"
              >
                {current.message}
              </p>
              <button
                ref={okRef}
                type="button"
                onClick={dismiss}
                style={{ backgroundColor: accent.bg, color: accent.fg, outlineColor: accent.fg }}
                className="mt-6 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-black transition hover:brightness-95 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[.99]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
