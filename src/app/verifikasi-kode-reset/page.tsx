import type { Metadata } from "next";
import { Suspense } from "react";
import VerifikasiKodeResetForm from "./VerifikasiKodeResetForm";

export const metadata: Metadata = {
  title: "Verifikasi Kode Reset — AIDIL STORE",
  description: "Masukkan kode verifikasi 6 digit untuk mengatur ulang password AIDIL STORE.",
};

export default function VerifikasiKodeResetPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md animate-pulse rounded-3xl border border-app-border bg-app-surface p-8 text-sm text-app-muted shadow-sm">
          Memuat halaman verifikasi...
        </div>
      }
    >
      <VerifikasiKodeResetForm />
    </Suspense>
  );
}
