"use client";

/**
 * Tiga tampilan status jaringan yang konsisten dengan tema hitam-emas:
 * - NetworkSkeleton: skeleton loading (kotak abu-abu berdenyut)
 * - NetworkError: status koneksi bermasalah + tombol Coba Lagi
 * - NetworkEmpty: status kosong "Belum ada data"
 */

export function NetworkSkeleton({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-4 ${className}`}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-zinc-800" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-800/70" />
            </div>
            <div className="h-3.5 w-20 shrink-0 animate-pulse rounded bg-zinc-800/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NetworkError({
  title = "Koneksi bermasalah",
  description = "Data gagal dimuat. Periksa koneksi internet Anda lalu coba lagi.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900 p-8 text-center"
      role="alert"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-400/10 text-3xl">
        📡
      </div>
      <h2 className="mt-4 text-lg font-black text-white">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-gold-300"
        >
          Coba Lagi
        </button>
      )}
    </div>
  );
}

export function NetworkEmpty({
  title = "Belum ada data",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 py-12 text-center">
      <p className="text-base font-medium text-zinc-300">{title}</p>
      {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
    </div>
  );
}
