// Skeleton loading Design System AIDIL STORE.
// LoadingSkeleton = daftar baris siap pakai (pola sama dengan NetworkState),
// Skeleton = kotak denyut tunggal untuk kebutuhan bebas.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-app-inset ${className}`} />;
}

export default function LoadingSkeleton({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={`rounded-2xl border border-app-border bg-app-surface p-4 ${className}`}
    >
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-3.5 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
