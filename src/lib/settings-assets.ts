// Aset tema & beranda disimpan di Supabase Storage (bucket settings-assets).
// Database hanya menyimpan URL publik — tidak pernah base64, tidak pernah
// menulis ke disk lokal karena proyek berjalan di Vercel.

export const SETTINGS_ASSET_BUCKET = "settings-assets";
export const MAX_SETTINGS_ASSET_BYTES = 2 * 1024 * 1024;

export const SETTINGS_ASSET_KINDS = ["banner", "logo-light", "logo-dark", "favicon", "og", "operator"] as const;
export type SettingsAssetKind = (typeof SETTINGS_ASSET_KINDS)[number];

export const SETTINGS_ASSET_KIND_LABEL: Record<SettingsAssetKind, string> = {
  banner: "Banner 16:7",
  "logo-light": "Logo mode terang",
  "logo-dark": "Logo mode gelap",
  favicon: "Favicon",
  og: "Gambar share (OG)",
  operator: "Logo operator",
};

export const SETTINGS_ASSET_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type SettingsAssetType = (typeof SETTINGS_ASSET_TYPES)[number];

export const SETTINGS_ASSET_EXT: Record<SettingsAssetType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function isSettingsAssetKind(value: unknown): value is SettingsAssetKind {
  return typeof value === "string" && (SETTINGS_ASSET_KINDS as readonly string[]).includes(value);
}

/**
 * Validasi tipe file dari isi byte, bukan header MIME kiriman browser yang
 * mudah dipalsukan. SVG sengaja tidak diterima: SVG dapat memuat skrip dan
 * dirender sebagai halaman saat dibuka langsung.
 */
export function sniffSettingsAssetType(bytes: Uint8Array): SettingsAssetType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Path objek storage dari URL publik (dipakai bila suatu saat aset dihapus). */
export function settingsStoragePathFromUrl(url: string): string | null {
  const marker = `/object/public/${SETTINGS_ASSET_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const path = url.slice(index + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}
