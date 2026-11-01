import type { Metadata } from "next";
import { Inter, Nunito, Plus_Jakarta_Sans } from "next/font/google";
import { unstable_noStore as noStore } from "next/cache";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import AppLoader from "@/components/AppLoader";
import Navbar from "@/components/Navbar";
import RouteProgress from "@/components/RouteProgress";
import ToastProvider from "@/components/ToastProvider";
import WelcomeExperience from "@/components/WelcomeExperience";
import LevelKycProvider from "@/components/settings/LevelKycProvider";
import { isFeatureEnabled } from "@/lib/features";
import { getSetting } from "@/lib/settings";
import { getBottomNav } from "@/lib/site-settings";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_THEME_SETTINGS, THEME_SETTINGS_KEY, buildThemeCss, themeHtmlVariables } from "@/lib/theme-settings";
import { DEFAULT_LEVEL_KYC_SETTINGS, LEVEL_KYC_SETTINGS_KEY } from "@/lib/level-kyc-settings";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://aidil-store.example.com";
const fallbackDescription =
  "Marketplace digital modern dengan pembayaran otomatis QRIS, e-wallet, Virtual Account bank, wallet internal, dan delivery produk digital.";

// Font hanya dari daftar tetap ini (dipilih admin lewat Tema & Branding).
// next/font menyajikan berkasnya sendiri, jadi tidak ada permintaan ke Google
// saat halaman dibuka pengunjung.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-jakarta" });
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const nunito = Nunito({ subsets: ["latin"], display: "swap", variable: "--font-nunito" });

export async function generateMetadata(): Promise<Metadata> {
  const theme = await getSetting(THEME_SETTINGS_KEY, DEFAULT_THEME_SETTINGS);
  const shopName = theme.identity.shopName || "AIDIL STORE";
  const title = `${shopName} — Digital Marketplace`;
  const description = theme.identity.tagline || fallbackDescription;
  const icon = theme.identity.faviconUrl || "/aidil-logo.png";
  const ogImage = theme.identity.ogImageUrl || "/aidil-logo.png";

  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: `%s — ${shopName}` },
    description,
    icons: { icon, apple: icon },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: shopName },
    openGraph: {
      type: "website",
      locale: "id_ID",
      siteName: shopName,
      title,
      description,
      url: siteUrl,
      images: [{ url: ogImage, alt: shopName }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema terbit harus ikut berubah tanpa deploy. Tanpa ini layout bisa
  // diprerender saat build dan menyimpan warna lama di shell rute statis.
  noStore();
  const supabase = createClient();
  const [scanQrisEnabled, theme, levelKyc, navSettings, auth] = await Promise.all([
    isFeatureEnabled("scan_qris"),
    getSetting(THEME_SETTINGS_KEY, DEFAULT_THEME_SETTINGS),
    getSetting(LEVEL_KYC_SETTINGS_KEY, DEFAULT_LEVEL_KYC_SETTINGS),
    getBottomNav("shop"),
    supabase.auth.getUser(),
  ]);

  // Menu Panel Admin hanya boleh muncul untuk peran yang sah. Pemeriksaan ini
  // di server agar flag tidak bisa dipalsukan dari browser; rute /admin tetap
  // punya penjaga izinnya sendiri.
  let isAdmin = false;
  if (auth.data.user) {
    const { data: viewer } = await supabase.from("profiles").select("role").eq("id", auth.data.user.id).maybeSingle();
    isAdmin = viewer?.role === "ADMIN" || viewer?.role === "SUPER_ADMIN";
  }
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${jakarta.variable} ${inter.variable} ${nunito.variable}`}
      style={themeHtmlVariables(theme) as React.CSSProperties}
    >
      <head>
        {/* Variabel tema dari server: tidak ada kilatan warna lama sebelum hidrasi. */}
        <style id="theme-vars" dangerouslySetInnerHTML={{ __html: buildThemeCss(theme) }} />
      </head>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ToastProvider>
            <RouteProgress />
            <AppLoader />
            <WelcomeExperience />
            <LevelKycProvider settings={levelKyc}>
              <Navbar
                scanQrisEnabled={scanQrisEnabled}
                brandName={theme.identity.shopName}
                logoLight={theme.identity.logoLight}
                logoDark={theme.identity.logoDark}
                navSettings={navSettings}
                isAdmin={isAdmin}
              />
              <main className="mx-auto min-h-[calc(100vh-80px)] max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
            </LevelKycProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
