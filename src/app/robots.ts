import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://aidil-store.example.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin-login",
          "/admin/",
          "/api/",
          "/dashboard",
          "/wallet",
          "/profile",
          "/settings",
          "/orders",
          "/transactions",
          "/checkout",
          "/bantuan",
          "/notifications",
          "/kyc",
          "/verify-account",
          "/verify-email",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
