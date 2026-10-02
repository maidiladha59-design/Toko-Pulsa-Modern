"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind; leaving?: boolean };

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind) => void }>({
  show: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

const ICON_STYLES: Record<ToastKind, string> = {
  success: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  error: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  info: "bg-gold-100 text-gold-700 dark:bg-gold-400/15 dark:text-gold-300",
};

const BORDER_STYLES: Record<ToastKind, string> = {
  success: "border-emerald-200 dark:border-emerald-500/30",
  error: "border-red-200 dark:border-red-500/30",
  info: "border-gold-200 dark:border-gold-400/30",
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    // Tandai "leaving" dulu supaya sempat animasi keluar, baru dihapus dari state.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-4 z-[200] flex flex-col items-center gap-2.5 px-4 sm:top-6"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-app-surface p-4 shadow-2xl shadow-zinc-950/15 ${
              BORDER_STYLES[t.kind]
            } ${t.leaving ? "toast-pop-out" : ""}`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-black ${
                ICON_STYLES[t.kind]
              }`}
            >
              {ICONS[t.kind]}
            </span>
            <p className="flex-1 pt-1 text-sm font-bold leading-5 text-app-text">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 rounded-lg p-1 text-sm font-bold text-app-muted transition hover:bg-app-inset hover:text-app-text"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}