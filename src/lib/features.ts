import { createClient } from "@supabase/supabase-js";

export const FEATURES = [
  {
    key: "scan_qris",
    label: "Scan QRIS",
    description: "Pelanggan bisa memindai QRIS dan membayar dari saldo AIDIL STORE.",
  },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];

export async function isFeatureEnabled(key: FeatureKey): Promise<boolean> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      }
    );
    const { data, error } = await sb.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
    if (error || !data) return true;
    return data.enabled !== false;
  } catch {
    return true;
  }
}