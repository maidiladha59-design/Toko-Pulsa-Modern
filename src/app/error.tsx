"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg animate-page-in rounded-3xl border bg-white p-8 text-center shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-gold-600">AIDIL STORE</p>
      <h1 className="mt-2 text-xl font-black">Halaman ini mengalami kendala</h1>
      <p className="mt-2 text-sm text-slate-500">
        Laporan error sudah terkirim otomatis ke tim teknis. Silakan coba lagi.
      </p>
      <button
        onClick={() => reset()}
        className="mt-4 rounded-xl bg-gold-600 px-5 py-2.5 text-sm font-black text-white"
      >
        Coba Lagi
      </button>
    </div>
  );
}
