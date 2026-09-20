// Konfigurasi Sentry untuk browser (client-side). File ini otomatis dipakai
// Next.js sejak konvensi instrumentation-client — menggantikan sentry.client.config.ts lama.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  sendDefaultPii: false,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});

// Melacak navigasi antar halaman App Router agar transaksi performa lebih akurat.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
