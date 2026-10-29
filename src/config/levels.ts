// Tingkatan pelanggan AIDIL STORE.
//
// Sumber angka: jumlah transaksi berhasil (COMPLETED), data yang sama dengan
// halaman Peringkat (public.user_rankings.successful_transactions). Gagal,
// dibatalkan, dan refund tidak dihitung. Ubah ambang di sini saja.

export type LevelKey = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export type LevelTier = {
  key: LevelKey;
  label: string;
  min: number;
  max: number;
};

export const LEVELS: readonly LevelTier[] = [
  { key: "bronze", label: "Bronze", min: 0, max: 9 },
  { key: "silver", label: "Silver", min: 10, max: 49 },
  { key: "gold", label: "Gold", min: 50, max: 149 },
  { key: "platinum", label: "Platinum", min: 150, max: 399 },
  { key: "diamond", label: "Diamond", min: 400, max: Number.POSITIVE_INFINITY },
];

function normalizeCount(count: number): number {
  const value = Number(count);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/** Tingkatan untuk jumlah transaksi berhasil. Angka aneh tidak pernah melempar error. */
export function levelForCount(count: number): LevelTier {
  const value = normalizeCount(count);
  return LEVELS.find((tier) => value >= tier.min && value <= tier.max) ?? LEVELS[0];
}

/** Tingkatan berikutnya + sisa transaksi untuk naik. null = sudah di puncak. */
export function nextLevel(count: number): { tier: LevelTier; remaining: number } | null {
  const value = normalizeCount(count);
  const index = LEVELS.findIndex((tier) => tier.key === levelForCount(value).key);
  const tier = LEVELS[index + 1];
  if (!tier) return null;
  return { tier, remaining: Math.max(0, tier.min - value) };
}
