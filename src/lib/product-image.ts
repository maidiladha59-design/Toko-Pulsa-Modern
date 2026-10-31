// Aturan gambar produk dipakai server (API + halaman) dan client (panel admin).
// File tetap di Supabase Storage; database hanya menyimpan URL https.

export const PRODUCT_IMAGE_BUCKET = "product-thumbnails";
export const BRAND_IMAGE_BUCKET = "site-media";
export const MAX_PRODUCT_IMAGE_INPUT_BYTES = 2 * 1024 * 1024;
export const PRODUCT_IMAGE_SIZE = 512;
export const PRODUCT_IMAGE_QUALITY = 0.8;
export const PRODUCT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type ProductImageType = (typeof PRODUCT_IMAGE_TYPES)[number];
export type ProductImageSource = "product" | "brand" | "category" | "default";

// Validasi tipe di server memakai isi byte, bukan header MIME dari browser.
export function sniffProductImageType(bytes: Uint8Array): ProductImageType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

export type PublicStorageRef = { bucket: string; path: string };

// URL publik Supabase: .../storage/v1/object/public/<bucket>/<path>
export function publicStorageRef(url?: string | null): PublicStorageRef | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const rest = url.slice(index + marker.length).split("?")[0];
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const path = decodeURIComponent(rest.slice(slash + 1));
  return bucket && path ? { bucket, path } : null;
}

export function normalizeBrandKey(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Nama file drag-drop, mis. "Free Fire.webp" / "mobile-legends.png" -> key brand.
export function brandKeyFromFilename(name: string): string {
  return normalizeBrandKey(
    String(name || "")
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
  );
}

export function normalizeCategoryKey(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

// Prioritas: gambar khusus produk -> gambar lama produk -> brand -> kategori -> ikon.
export function resolveProductImage(
  ownImage?: string | null,
  legacyImage?: string | null,
  brandLogo?: string | null,
  categoryImage?: string | null
): { src: string | null; source: ProductImageSource } {
  if (ownImage) return { src: ownImage, source: "product" };
  if (legacyImage) return { src: legacyImage, source: "product" };
  if (brandLogo) return { src: brandLogo, source: "brand" };
  if (categoryImage) return { src: categoryImage, source: "category" };
  return { src: null, source: "default" };
}
