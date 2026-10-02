// Utilitas Split Bill. Semua nominal integer (rupiah) — tanpa float.
// Pembagian rata HARUS sama dengan create_split_bill di
// supabase/migrations_v76_split_bill.sql:
//   base = total / jumlah_peserta (pembagian bulat ke bawah)
//   sisa = total - base * jumlah_peserta → dibebankan ke peserta PERTAMA.

export type SplitMode = "EQUAL" | "CUSTOM";

export function calcEqualShares(totalAmount: number, count: number): number[] {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) return [];
  if (!Number.isInteger(count) || count <= 0) return [];
  const base = Math.floor(totalAmount / count);
  const remainder = totalAmount - base * count;
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? remainder : 0));
}

// Sisa pembagian yang dibebankan ke peserta pertama (untuk penjelasan UI).
export function equalSplitRemainder(totalAmount: number, count: number): number {
  if (!Number.isInteger(totalAmount) || totalAmount <= 0) return 0;
  if (!Number.isInteger(count) || count <= 0) return 0;
  return totalAmount - Math.floor(totalAmount / count) * count;
}
