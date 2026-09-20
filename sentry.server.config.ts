// Konfigurasi Sentry untuk runtime server (Node.js) Next.js.
// Aktif otomatis kalau SENTRY_DSN diisi di environment — kalau kosong, Sentry idle
// dan tidak mengirim apa pun (aman untuk dev/staging tanpa DSN).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  // Data pengguna sensitif (email, cookie, header auth) sengaja TIDAK dikirim otomatis.
  sendDefaultPii: false,
  enabled: Boolean(process.env.SENTRY_DSN),
});
