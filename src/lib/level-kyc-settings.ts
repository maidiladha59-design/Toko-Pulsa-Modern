import { z } from "zod";
import { isIconName } from "@/components/icons/registry";
import { hexColorSchema, plainTextSchema } from "@/lib/setting-primitives";
import { LEVELS, levelForCount, nextLevel, type LevelTier } from "@/config/levels";
import type { LevelTierSetting } from "@/lib/level-tiers";

// Aturan level & batas KYC (site_settings.level_kyc_settings, migrasi v107).
//
// src/config/levels.ts tetap menjadi DEFAULT bawaan. Nilai di pengaturan
// menggantikannya saat sudah diterbitkan. File ini murni (tanpa database)
// sehingga bisa dipakai server untuk menegakkan batas maupun client untuk
// menampilkan level. Helper tampilan ada di "@/lib/level-tiers" (tanpa zod)
// agar client tidak perlu memuat skema validasi.

export const LEVEL_KYC_SETTINGS_KEY = "level_kyc_settings";

export const KYC_LIMIT_STATUSES = ["unverified", "pending", "verified"] as const;
export type KycLimitStatus = (typeof KYC_LIMIT_STATUSES)[number];

export const KYC_LIMIT_STATUS_LABELS: Record<KycLimitStatus, string> = {
  unverified: "Belum terverifikasi",
  pending: "Menunggu verifikasi",
  verified: "Terverifikasi",
};

export const KYC_LIMIT_FIELDS = [
  { key: "maxTopupPerTx", label: "Maksimal Top Up per transaksi", unit: "rupiah" },
  { key: "maxTopupPerDay", label: "Maksimal Top Up per hari", unit: "rupiah" },
  { key: "maxTransferPerTx", label: "Maksimal transfer per transaksi", unit: "rupiah" },
  { key: "maxTransferPerDay", label: "Maksimal transfer per hari", unit: "rupiah" },
  { key: "maxPurchasePerDay", label: "Maksimal pembelian per hari", unit: "rupiah" },
] as const;

export type KycLimitFieldKey = (typeof KYC_LIMIT_FIELDS)[number]["key"];

export type KycLimits = Record<KycLimitFieldKey, number>;

export type { LevelTierSetting } from "@/lib/level-tiers";
export { levelForTiers, nextTierForCount, tierMax } from "@/lib/level-tiers";

export type LevelKycSettings = {
  levels: LevelTierSetting[];
  kyc: Record<KycLimitStatus, KycLimits> & {
    /** true = gradasi warna-warni hanya untuk akun terverifikasi. */
    rainbowRingVerifiedOnly: boolean;
    verificationHint: string;
  };
};

const DEFAULT_LEVELS: LevelTierSetting[] = LEVELS.map((tier) => ({
  id: tier.key,
  label: tier.label,
  min: tier.min,
  color:
    tier.key === "bronze"
      ? "#CD7F32"
      : tier.key === "silver"
        ? "#C0C0C0"
        : tier.key === "gold"
          ? "#2E9EF5"
          : tier.key === "platinum"
            ? "#7DD3FC"
            : "#A78BFA",
  icon:
    tier.key === "bronze"
      ? "medal"
      : tier.key === "silver"
        ? "medal"
        : tier.key === "gold"
          ? "crown"
          : tier.key === "platinum"
            ? "shield"
            : "sparkle",
}));

const UNLIMITED = 0;

const DEFAULT_UNVERIFIED: KycLimits = {
  maxTopupPerTx: 5_000_000,
  maxTopupPerDay: 10_000_000,
  maxTransferPerTx: 5_000_000,
  maxTransferPerDay: 10_000_000,
  maxPurchasePerDay: 10_000_000,
};

const DEFAULT_PENDING: KycLimits = {
  maxTopupPerTx: 5_000_000,
  maxTopupPerDay: 10_000_000,
  maxTransferPerTx: 5_000_000,
  maxTransferPerDay: 10_000_000,
  maxPurchasePerDay: 10_000_000,
};

const DEFAULT_VERIFIED: KycLimits = {
  maxTopupPerTx: 50_000_000,
  maxTopupPerDay: 100_000_000,
  maxTransferPerTx: 50_000_000,
  maxTransferPerDay: 100_000_000,
  maxPurchasePerDay: 100_000_000,
};

export const DEFAULT_LEVEL_KYC_SETTINGS: LevelKycSettings = {
  levels: DEFAULT_LEVELS,
  kyc: {
    unverified: DEFAULT_UNVERIFIED,
    pending: DEFAULT_PENDING,
    verified: DEFAULT_VERIFIED,
    rainbowRingVerifiedOnly: true,
    verificationHint:
      "Verifikasi identitas untuk membuka cincin warna-warni, menaikkan batas transaksi, dan keamanan akun yang lebih baik.",
  },
};

const levelSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "ID level tidak valid.")
    .max(32, "ID level terlalu panjang.")
    .regex(/^[a-z0-9_-]+$/, "ID level hanya huruf kecil, angka, dan tanda hubung."),
  label: z.string().trim().min(1, "Nama level wajib diisi.").max(40, "Nama level maksimal 40 karakter."),
  min: z
    .number({ invalid_type_error: "Batas minimal level harus angka." })
    .int("Batas minimal level harus bilangan bulat.")
    .min(0, "Batas minimal level tidak boleh negatif.")
    .max(10_000_000, "Batas minimal level terlalu besar."),
  color: hexColorSchema,
  icon: z.string().trim().refine(isIconName, { message: "Ikon level tidak dikenal." }),
});

const limitObject = z.object({
  maxTopupPerTx: z.number().int().min(UNLIMITED).max(1_000_000_000_000),
  maxTopupPerDay: z.number().int().min(UNLIMITED).max(1_000_000_000_000),
  maxTransferPerTx: z.number().int().min(UNLIMITED).max(1_000_000_000_000),
  maxTransferPerDay: z.number().int().min(UNLIMITED).max(1_000_000_000_000),
  maxPurchasePerDay: z.number().int().min(UNLIMITED).max(1_000_000_000_000),
});

export const levelKycSettingsInputSchema = z.object({
  levels: z.array(levelSchema).min(1, "Minimal satu level.").max(10, "Maksimal 10 level.").default(DEFAULT_LEVELS),
  kyc: z
    .object({
      unverified: limitObject.default(DEFAULT_UNVERIFIED),
      pending: limitObject.default(DEFAULT_PENDING),
      verified: limitObject.default(DEFAULT_VERIFIED),
      rainbowRingVerifiedOnly: z.boolean().default(true),
      verificationHint: plainTextSchema(240).default(DEFAULT_LEVEL_KYC_SETTINGS.kyc.verificationHint),
    })
    .default(DEFAULT_LEVEL_KYC_SETTINGS.kyc),
});

export function normalizeLevelKycSettings(
  value: z.infer<typeof levelKycSettingsInputSchema>
): LevelKycSettings {
  const levels = value.levels
    .map((level) => ({
      id: level.id.trim(),
      label: level.label.trim(),
      min: Math.floor(level.min),
      color: level.color.trim(),
      icon: level.icon,
    }))
    .sort((a, b) => a.min - b.min);

  return {
    levels,
    kyc: {
      unverified: { ...value.kyc.unverified },
      pending: { ...value.kyc.pending },
      verified: { ...value.kyc.verified },
      rainbowRingVerifiedOnly: value.kyc.rainbowRingVerifiedOnly,
      verificationHint: value.kyc.verificationHint.trim(),
    },
  };
}

export function limitsForStatus(
  settings: LevelKycSettings,
  status: KycLimitStatus
): KycLimits {
  return settings.kyc[status] ?? DEFAULT_LEVEL_KYC_SETTINGS.kyc.unverified;
}

/** null = tidak dibatasi (nilai 0) atau nominal di bawah batas. */
export function limitExceeded(
  amount: number,
  limit: number
): boolean {
  return limit > 0 && Number(amount) > limit;
}

export function levelKycValidate(value: LevelKycSettings): string | null {
  if (value.levels.length === 0) return "Minimal satu level harus ada.";
  if (value.levels.length > 10) return "Maksimal 10 level.";
  if (value.levels[0].min !== 0) return "Level pertama harus dimulai dari 0 transaksi.";

  const ids = new Set<string>();
  const labels = new Set<string>();
  for (let i = 0; i < value.levels.length; i += 1) {
    const tier = value.levels[i];
    if (ids.has(tier.id)) return `ID level "${tier.id}" dipakai lebih dari satu kali.`;
    if (labels.has(tier.label.toLowerCase())) return `Nama level "${tier.label}" dipakai lebih dari satu kali.`;
    ids.add(tier.id);
    labels.add(tier.label.toLowerCase());
    if (i > 0 && tier.min <= value.levels[i - 1].min) {
      return `Batas minimal level "${tier.label}" harus lebih besar dari level sebelumnya.`;
    }
  }

  for (const status of KYC_LIMIT_STATUSES) {
    const limits = value.kyc[status];
    if (limits.maxTopupPerTx > 0 && limits.maxTopupPerDay > 0 && limits.maxTopupPerTx > limits.maxTopupPerDay) {
      return `Batas Top Up per transaksi (${KYC_LIMIT_STATUS_LABELS[status]}) tidak boleh lebih besar dari batas harian.`;
    }
    if (limits.maxTransferPerTx > 0 && limits.maxTransferPerDay > 0 && limits.maxTransferPerTx > limits.maxTransferPerDay) {
      return `Batas transfer per transaksi (${KYC_LIMIT_STATUS_LABELS[status]}) tidak boleh lebih besar dari batas harian.`;
    }
  }
  return null;
}

/** Tidak ada aturan tambahan khusus Terbitkan; draf yang valid boleh tayang. */
export function levelKycPublishError(value: LevelKycSettings): string | null {
  return levelKycValidate(value);
}

export type LevelTierLike = LevelTier;
export { levelForCount, nextLevel };
