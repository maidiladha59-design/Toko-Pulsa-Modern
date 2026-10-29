import type { ReactNode } from "react";
import Icon from "@/components/icons/Icon";

// EmptyState standar Design System AIDIL STORE — dipakai di semua halaman
// yang datanya kosong. Satu-satunya tampilan kosong yang canonical;
// src/components/EmptyState.tsx lama akan dihapus saat halaman dimigrasikan.
// `icon` adalah nama ikon registry (mis. "inbox"); nilai emoji lama tetap
// dikonversi lewat fallback di <Icon>.
export default function EmptyState({
  icon = "inbox",
  title = "Belum ada data",
  description,
  action,
  className = "",
}: {
  icon?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-app-border bg-app-surface/50 py-12 text-center ${className}`}
    >
      <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-accent-soft text-app-kicker">
        <Icon name={icon} size={28} />
      </span>
      <p className="mt-4 text-base font-medium text-app-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-app-subtle">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
