"use client";

// ErrorState standar Design System AIDIL STORE — dipakai saat data gagal dimuat
// (bukan hanya masalah jaringan). Pola visual sama dengan NetworkError;
// NetworkState.tsx tetap ada untuk kasus spesifik jaringan sampai halaman dimigrasikan.
export default function ErrorState({
  icon = "⚠️",
  title = "Gagal memuat data",
  description = "Terjadi kendala saat memuat data. Periksa koneksi internet Anda lalu coba lagi.",
  onRetry,
  className = "",
}: {
  icon?: string;
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={`rounded-3xl border border-dashed border-app-border bg-app-surface p-8 text-center ${className}`}>
      <span aria-hidden className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-app-accent-soft text-3xl">
        {icon}
      </span>
      <h2 className="mt-4 text-lg font-black text-app-text">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-app-muted">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-gold mt-5 inline-flex min-h-[44px] items-center rounded-xl px-4 py-2.5 text-sm font-black transition"
        >
          Coba Lagi
        </button>
      )}
    </div>
  );
}
