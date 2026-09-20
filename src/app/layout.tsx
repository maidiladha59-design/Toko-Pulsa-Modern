import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import ToastProvider from "@/components/ToastProvider";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://aidil-store.example.com";
const title = "AIDIL STORE — Digital Marketplace";
const description =
  "Marketplace digital modern dengan pembayaran otomatis QRIS, e-wallet, Virtual Account bank, wallet internal, dan delivery produk digital.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s — AIDIL STORE" },
  description,
  icons: { icon: "/aidil-logo.png", apple: "/aidil-logo.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "AIDIL STORE" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "AIDIL STORE",
    title,
    description,
    url: siteUrl,
    images: [{ url: "/aidil-logo.png", width: 512, height: 512, alt: "AIDIL STORE" }],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/aidil-logo.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <ToastProvider>
          <Navbar />
          <main className="mx-auto min-h-[calc(100vh-80px)] max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
