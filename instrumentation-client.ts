// Konfigurasi Sentry untuk browser (client-side).
//
// Penting: JANGAN memakai `import * as Sentry from "@sentry/nextjs"` statis di
// file ini. File ini disuntikkan Sentry ke entry "main-app", sehingga import
// statis membuat seluruh SDK browser (~94 kB gzip) ikut terunduh di SETIAP
// halaman — walau NEXT_PUBLIC_SENTRY_DSN kosong dan SDK tidak melakukan apa pun.
// Dengan import dinamis di dalam cabang ini, build tanpa DSN tidak membawa SDK
// sama sekali; build dengan DSN memuatnya setelah hidrasi.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
      sendDefaultPii: false,
      enabled: true,
    });
  });
}

// Melacak navigasi antar halaman App Router agar transaksi performa lebih akurat.
export function onRouterTransitionStart(url: string, navigationType: string) {
  if (!dsn) return;
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.captureRouterTransitionStart(url, navigationType as "push" | "replace" | "traverse");
  });
}
