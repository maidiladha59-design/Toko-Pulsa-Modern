"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="id">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, color: "#b45309", textTransform: "uppercase" }}>AIDIL STORE</p>
            <h1 style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>Terjadi kesalahan tak terduga</h1>
            <p style={{ marginTop: 8, fontSize: 14, color: "#475569" }}>
              Tim kami sudah menerima laporan error ini secara otomatis. Silakan coba lagi.
            </p>
            <button
              onClick={() => reset()}
              style={{ marginTop: 16, borderRadius: 12, background: "#d97706", color: "#fff", padding: "10px 20px", fontWeight: 800, border: "none", cursor: "pointer" }}
            >
              Coba Lagi
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
