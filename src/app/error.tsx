"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry dimuat hanya saat ada error supaya SDK tidak masuk bundle awal semua halaman.
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error)).catch(() => {});
  }, [error]);

  return (
    <div className="mx-auto max-w-lg animate-page-in rounded-3xl border bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-black">Halaman ini mengalami kendala</h1>
      <p className="mt-2 text-sm text-slate-500">
        Laporan error sudah terkirim otomatis ke tim teknis. Silakan coba lagi.
      </p>
      <button
        onClick={() => reset()}
        className="btn-gold mt-4 rounded-xl px-5 py-2.5 text-sm font-black"
      >
        Coba Lagi
      </button>
    </div>
  );
}
