import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://aidil-store.example.com";

// Kategori PPOB statis, sesuai daftar di halaman beranda (src/app/page.tsx).
const ppobCategories = [
  "pulsa",
  "paket-data",
  "top-up-game",
  "e-wallet",
  "pln",
  "voucher",
  "streaming",
  "tv",
  "gas",
  "media-sosial",
];

const staticRoutes = [
  "",
  "/layanan",
  "/products",
  "/prices",
  "/faq",
  "/terms",
  "/privacy",
  "/identitas-usaha",
  "/pengaduan-konsumen",
  "/ranking",
  "/scan-qris",
  "/transfer-uang",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.6,
  }));

  for (const slug of ppobCategories) {
    entries.push({
      url: `${siteUrl}/ppob/${slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  try {
    const supabase = createClient();
    const { data: products } = await supabase
      .from("products")
      .select("slug, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(2000);

    for (const p of products || []) {
      entries.push({
        url: `${siteUrl}/products/${p.slug}`,
        lastModified: p.created_at ? new Date(p.created_at) : new Date(),
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch {
    // Kalau query gagal (mis. saat build tanpa koneksi DB), tetap kirim sitemap statis.
  }

  return entries;
}
