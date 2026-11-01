import { z } from "zod";
import {
  DEFAULT_INFO_TICKER,
  SITE_SETTINGS_TAG,
  infoTickerInputSchema,
  normalizeInfoTicker,
} from "@/lib/info-ticker";
import {
  DEFAULT_HOME_SETTINGS,
  HOME_SETTINGS_KEY,
  homePublishError,
  homeSettingsInputSchema,
  normalizeHomeSettings,
} from "@/lib/home-settings";
import {
  DEFAULT_THEME_SETTINGS,
  THEME_SETTINGS_KEY,
  normalizeThemeSettings,
  themePublishError,
  themeSettingsInputSchema,
} from "@/lib/theme-settings";
import {
  DEFAULT_PAGES_SETTINGS,
  PAGES_SETTINGS_KEY,
  normalizePagesSettings,
  pagesPublishError,
  pagesSettingsInputSchema,
} from "@/lib/pages-settings";
import {
  DEFAULT_LEVEL_KYC_SETTINGS,
  LEVEL_KYC_SETTINGS_KEY,
  levelKycPublishError,
  levelKycSettingsInputSchema,
  normalizeLevelKycSettings,
} from "@/lib/level-kyc-settings";
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATES_SETTINGS_KEY,
  normalizeNotificationTemplates,
  notificationTemplatesInputSchema,
  notificationTemplatesPublishError,
} from "@/lib/notification-templates";
import {
  DEFAULT_OPERATOR_SETTINGS,
  OPERATOR_SETTINGS_KEY,
  normalizeOperatorSettings,
  operatorSettingsInputSchema,
  operatorSettingsPublishError,
} from "@/lib/operator-settings";
import {
  BOTTOM_NAV_ADMIN_KEY,
  BOTTOM_NAV_SHOP_KEY,
  DEFAULT_BOTTOM_NAV_ADMIN,
  DEFAULT_BOTTOM_NAV_SHOP,
  bottomNavAdminInputSchema,
  bottomNavShopInputSchema,
  normalizeBottomNavAdmin,
  normalizeBottomNavShop,
} from "@/lib/bottom-nav";
import {
  hexColorSchema,
  internalPathOrHttpsSchema,
  isInternalPathOrHttps,
  optionalInternalPathOrHttpsSchema,
  plainTextSchema,
} from "@/lib/setting-primitives";

export {
  hexColorSchema,
  internalPathOrHttpsSchema,
  isInternalPathOrHttps,
  optionalInternalPathOrHttpsSchema,
  plainTextSchema,
};

// Fondasi "Pengaturan Terkelola" (migrasi v105).
// File ini murni (tanpa next/cache atau Supabase) supaya aman dipakai
// komponen client, API route, maupun server component.
//
// Aturan keamanan:
//  - Teks dari admin selalu diperlakukan sebagai teks biasa. Tidak ada
//    rendering HTML di SettingsForm (lihat guard test v105).
//  - URL hanya path internal (diawali "/") atau https.
//  - Warna hanya hex CSS yang valid.

export const CATALOG_CACHE_TAGS = ["catalog", "feature-flags"] as const;
export const BANNER_CACHE_TAGS = ["banners", "home-banners"] as const;

/** Tag cache per kunci pengaturan, dipakai getSetting + revalidateTag. */
export function settingTag(key: string): string {
  return `settings:${key}`;
}

export type ManagedSettingDefinition<T = Record<string, unknown>> = {
  key: string;
  label: string;
  /** Permission admin_role_permissions yang wajib dimiliki untuk mengelola. */
  permission: string;
  defaults: T;
  schema: z.ZodTypeAny;
  normalize?: (value: any) => T;
  /** Tag tambahan yang ikut diinvalidasi saat terbit (mis. cache lama halaman). */
  extraTags?: readonly string[];
  /** true = boleh dibaca anon lewat policy site_settings_public_read. */
  publicRead: boolean;
  /**
   * Pemeriksaan tambahan khusus Terbitkan. Boleh menyimpan draf yang belum
   * lengkap, tetapi nilai ini harus lolos sebelum tayang ke pengunjung.
   */
  validatePublish?: (value: any) => string | null;
};

export const MANAGED_SETTINGS = {
  info_ticker: {
    key: "info_ticker",
    label: "Info Berjalan",
    permission: "platform.manage",
    defaults: DEFAULT_INFO_TICKER,
    schema: infoTickerInputSchema,
    normalize: normalizeInfoTicker,
    extraTags: [SITE_SETTINGS_TAG],
    publicRead: true,
  },
  home_settings: {
    key: HOME_SETTINGS_KEY,
    label: "Pengaturan Beranda",
    permission: "platform.manage",
    defaults: DEFAULT_HOME_SETTINGS,
    schema: homeSettingsInputSchema,
    normalize: normalizeHomeSettings,
    extraTags: [SITE_SETTINGS_TAG, ...BANNER_CACHE_TAGS],
    publicRead: true,
    validatePublish: homePublishError,
  },
  theme_settings: {
    key: THEME_SETTINGS_KEY,
    label: "Tema & Branding",
    permission: "platform.manage",
    defaults: DEFAULT_THEME_SETTINGS,
    schema: themeSettingsInputSchema,
    normalize: normalizeThemeSettings,
    extraTags: ["theme"],
    publicRead: true,
    validatePublish: themePublishError,
  },
  pages_settings: {
    key: PAGES_SETTINGS_KEY,
    label: "Teks & Halaman",
    permission: "platform.manage",
    defaults: DEFAULT_PAGES_SETTINGS,
    schema: pagesSettingsInputSchema,
    normalize: normalizePagesSettings,
    extraTags: [SITE_SETTINGS_TAG],
    publicRead: true,
    validatePublish: pagesPublishError,
  },
  level_kyc_settings: {
    key: LEVEL_KYC_SETTINGS_KEY,
    label: "Aturan Level & KYC",
    permission: "platform.manage",
    defaults: DEFAULT_LEVEL_KYC_SETTINGS,
    schema: levelKycSettingsInputSchema,
    normalize: normalizeLevelKycSettings,
    extraTags: [SITE_SETTINGS_TAG],
    publicRead: true,
    validatePublish: levelKycPublishError,
  },
  notification_templates: {
    key: NOTIFICATION_TEMPLATES_SETTINGS_KEY,
    label: "Template Notifikasi",
    permission: "platform.manage",
    defaults: DEFAULT_NOTIFICATION_TEMPLATES,
    schema: notificationTemplatesInputSchema,
    normalize: normalizeNotificationTemplates,
    extraTags: [],
    publicRead: false,
    validatePublish: notificationTemplatesPublishError,
  },
  operator_settings: {
    key: OPERATOR_SETTINGS_KEY,
    label: "Pengaturan Operator",
    permission: "platform.manage",
    defaults: DEFAULT_OPERATOR_SETTINGS,
    schema: operatorSettingsInputSchema,
    normalize: normalizeOperatorSettings,
    extraTags: [SITE_SETTINGS_TAG],
    publicRead: true,
    validatePublish: operatorSettingsPublishError,
  },
  bottom_nav_shop: {
    key: BOTTOM_NAV_SHOP_KEY,
    label: "Navigasi Bawah Toko",
    permission: "platform.manage",
    defaults: DEFAULT_BOTTOM_NAV_SHOP,
    schema: bottomNavShopInputSchema,
    normalize: normalizeBottomNavShop,
    extraTags: [SITE_SETTINGS_TAG],
    publicRead: true,
  },
  bottom_nav_admin: {
    key: BOTTOM_NAV_ADMIN_KEY,
    label: "Navigasi Bawah Admin",
    permission: "platform.manage",
    defaults: DEFAULT_BOTTOM_NAV_ADMIN,
    schema: bottomNavAdminInputSchema,
    normalize: normalizeBottomNavAdmin,
    extraTags: [SITE_SETTINGS_TAG],
    publicRead: true,
  },
} as const satisfies Record<string, ManagedSettingDefinition<any>>;

export type ManagedSettingKey = keyof typeof MANAGED_SETTINGS;

const REGISTRY: Record<string, ManagedSettingDefinition<any>> = MANAGED_SETTINGS;

export function getManagedSetting(key: string): ManagedSettingDefinition<any> | null {
  return REGISTRY[key] ?? null;
}

export function isManagedSettingKey(key: string): key is ManagedSettingKey {
  return key in MANAGED_SETTINGS;
}

export type SettingParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

/** Validasi nilai dengan skema kunci terkait; nilai disimpan dalam bentuk ternormalisasi. */
export function parseSettingValue(key: string, value: unknown): SettingParseResult {
  const def = getManagedSetting(key);
  if (!def) return { ok: false, message: "Pengaturan tidak dikenal." };
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message || "Nilai pengaturan tidak valid." };
  }
  try {
    const normalized = def.normalize ? def.normalize(parsed.data) : parsed.data;
    return { ok: true, value: normalized as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Nilai pengaturan tidak valid." };
  }
}

export type SettingHistoryEntry = {
  id: number;
  value: Record<string, unknown>;
  version: number;
  action: "publish" | "restore";
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
};

export type ManagedSettingState = {
  key: string;
  label: string;
  permission: string;
  published: Record<string, unknown>;
  draft: Record<string, unknown> | null;
  version: number;
  hasDraft: boolean;
  updated_at: string | null;
  updated_by: string | null;
  draft_updated_at: string | null;
  draft_updated_by: string | null;
  history: SettingHistoryEntry[];
};

/** Tag yang harus diinvalidasi saat satu kunci berubah. */
export function settingCacheTags(key: string): string[] {
  const def = getManagedSetting(key);
  return [...new Set([settingTag(key), ...(def?.extraTags ?? [])])];
}

/** Semua tag pengaturan yang terdaftar (dipakai tombol Bersihkan Cache). */
export function allSettingsCacheTags(): string[] {
  const tags = new Set<string>();
  for (const def of Object.values(MANAGED_SETTINGS)) {
    tags.add(settingTag(def.key));
    for (const tag of def.extraTags ?? []) tags.add(tag);
  }
  return [...tags];
}
