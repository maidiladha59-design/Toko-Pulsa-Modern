import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_INFO_TICKER,
  INFO_TICKER_KEY,
  SITE_SETTINGS_TAG,
  normalizeInfoTicker,
  type InfoTickerInput,
  type InfoTickerSettings,
} from "@/lib/info-ticker";

// Sisi server: pembacaan pengaturan info berjalan dari public.site_settings.
// Konstanta, tipe, dan validasi ada di src/lib/info-ticker.ts (aman untuk client)
// supaya modul ini tidak pernah diimpor komponen "use client".

export * from "@/lib/info-ticker";

// Tabel public.site_settings hanya boleh ditulis service role; kebijakan RLS
// memberi akses SELECT kunci "info_ticker" ke anon & authenticated, jadi
// pembacaan beranda memakai kunci anon tanpa kredensial rahasia.
const readInfoTickerValue = unstable_cache(
  async (): Promise<Record<string, unknown> | null> => {
    try {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
        }
      );
      const { data, error } = await sb.from("site_settings").select("value").eq("key", INFO_TICKER_KEY).maybeSingle();
      if (error || !data || !data.value) return null;
      return data.value as Record<string, unknown>;
    } catch {
      return null;
    }
  },
  ["site-settings-info-ticker"],
  { revalidate: 60, tags: [SITE_SETTINGS_TAG] }
);

/** Selalu mengembalikan nilai yang bisa dirender; gagal baca = default, tanpa error ke user. */
export async function getInfoTicker(): Promise<InfoTickerSettings> {
  const value = await readInfoTickerValue();
  if (!value) return DEFAULT_INFO_TICKER;
  try {
    return normalizeInfoTicker(value as InfoTickerInput);
  } catch {
    return DEFAULT_INFO_TICKER;
  }
}
