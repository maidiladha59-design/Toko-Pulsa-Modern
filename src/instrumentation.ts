// Next.js memanggil register() ini otomatis saat server/edge runtime dinyalakan.
// Ini adalah satu-satunya cara error di Server Components / Route Handlers
// tertangkap otomatis tanpa harus try/catch manual di setiap file.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
