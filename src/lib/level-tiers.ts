// Helper level yang murni (tanpa zod) agar aman dipakai komponen client
// tanpa menyeret skema validasi ke bundle browser.

export type LevelTierSetting = {
  id: string;
  label: string;
  min: number;
  color: string;
  icon: string;
};

/** Batas atas untuk tampilan = minimal level berikutnya - 1. */
export function tierMax(levels: readonly LevelTierSetting[], index: number): number {
  const next = levels[index + 1];
  return next ? Math.max(next.min - 1, levels[index].min) : Number.POSITIVE_INFINITY;
}

export function levelForTiers(
  transactions: number,
  levels: readonly LevelTierSetting[]
): LevelTierSetting {
  const count =
    Number.isFinite(Number(transactions)) && Number(transactions) > 0 ? Math.floor(Number(transactions)) : 0;
  let match = levels[0];
  for (const tier of levels) {
    if (count >= tier.min) match = tier;
    else break;
  }
  return match;
}

export function nextTierForCount(
  transactions: number,
  levels: readonly LevelTierSetting[]
): { tier: LevelTierSetting; remaining: number } | null {
  const count =
    Number.isFinite(Number(transactions)) && Number(transactions) > 0 ? Math.floor(Number(transactions)) : 0;
  const current = levelForTiers(count, levels);
  const index = levels.findIndex((tier) => tier.id === current.id);
  const next = levels[index + 1];
  if (!next) return null;
  return { tier: next, remaining: Math.max(0, next.min - count) };
}
