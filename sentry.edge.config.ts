// Konfigurasi Sentry untuk runtime Edge (middleware.ts berjalan di sini).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  sendDefaultPii: false,
  enabled: Boolean(process.env.SENTRY_DSN),
});
