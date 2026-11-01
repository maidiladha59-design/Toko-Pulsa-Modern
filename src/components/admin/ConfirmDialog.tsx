"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Button from "@/components/ui/Button";

// Dialog konfirmasi admin. Selalu portal ke body karena panel admin memakai
// animasi yang menahan transform (position:fixed di dalam konten jadi relatif).
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Batal",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-3xl border border-app-border bg-app-surface p-5 shadow-2xl"
      >
        <h2 className="text-base font-black text-app-text">{title}</h2>
        <div className="mt-2 text-sm leading-6 text-app-muted">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "destructive" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
