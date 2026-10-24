import { createClient } from "@/lib/supabase/server";

export type RatingSummary = {
  average: number;
  totalCount: number;
};

export type PublishedRating = {
  displayName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

const EMPTY_SUMMARY: RatingSummary = { average: 0, totalCount: 0 };

// Dipakai Server Components (beranda, Identitas Usaha, /ulasan).
// Gagal RPC tidak boleh mematahkan halaman — badge cukup disembunyikan.
export async function getRatingSummary(): Promise<RatingSummary> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_rating_summary");
    if (error) return EMPTY_SUMMARY;

    const row = (Array.isArray(data) ? data[0] : data) as
      | { average?: number | string | null; total_count?: number | string | null }
      | null;

    return {
      average: Number(row?.average ?? 0) || 0,
      totalCount: Number(row?.total_count ?? 0) || 0,
    };
  } catch {
    return EMPTY_SUMMARY;
  }
}

export async function getPublishedRatings(limit = 20): Promise<PublishedRating[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_published_ratings", { p_limit: limit });
    if (error || !Array.isArray(data)) return [];

    return data.map((row: {
      display_name?: string | null;
      rating?: number | string | null;
      comment?: string | null;
      created_at?: string | null;
    }) => ({
      displayName: row.display_name || "Pengguna AIDIL STORE",
      rating: Number(row.rating ?? 0) || 0,
      comment: row.comment ?? null,
      createdAt: row.created_at || "",
    }));
  } catch {
    return [];
  }
}
