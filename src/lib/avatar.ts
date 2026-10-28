import type { SupabaseClient } from "@supabase/supabase-js";

// Avatar default toko (maskot) — berkas statis di repo sehingga selalu tersedia
// meskipun tabel avatars belum ada atau avatar_id pengguna null.
export const DEFAULT_AVATAR_URL = "/avatars/default.png";
export const DEFAULT_AVATAR_ID = "00000000-0000-0000-0000-000000000097";

export type AvatarRow = {
  id: string;
  image_url: string;
  label: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
};

// Dipakai beranda (server component), Navbar & Profil (browser client).
// Query terpisah dari profiles supaya halaman tetap berfungsi sebelum
// migrasi v97 dijalankan: kegagalan baca tabel avatars hanya menghasilkan
// fallback, bukan profil yang hilang.
export async function resolveAvatarUrl(
  supabase: SupabaseClient,
  avatarId: string | null | undefined
): Promise<string | null> {
  if (!avatarId) return null;
  const { data, error } = await supabase
    .from("avatars")
    .select("image_url,is_active")
    .eq("id", avatarId)
    .maybeSingle();
  if (error || !data || data.is_active === false) return null;
  return String(data.image_url || "");
}

export async function loadActiveAvatars(supabase: SupabaseClient): Promise<AvatarRow[]> {
  const { data, error } = await supabase
    .from("avatars")
    .select("id,image_url,label,is_active,is_default,sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data || []) as AvatarRow[];
}

export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 1024 * 1024;
// Badan permintaan ke function Vercel dibatasi ~4,5MB, jadi total satu unggahan
// harus di bawah angka itu sebelum file dikirim.
export const MAX_AVATAR_UPLOAD_TOTAL_BYTES = 4 * 1024 * 1024;
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

// Validasi tipe file di server memakai isi byte, bukan hanya header MIME yang
// dikirim browser dan mudah dipalsukan.
export function sniffAvatarType(bytes: Uint8Array): (typeof AVATAR_TYPES)[number] | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

// "/avatars/nama.png" pada URL publik Supabase Storage dipakai saat admin
// menghapus avatar supaya file di bucket ikut dibersihkan.
export function storagePathFromUrl(url: string): string | null {
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const path = url.slice(index + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}
