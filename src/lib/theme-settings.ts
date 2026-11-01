import { z } from "zod";
import { hexColorSchema } from "@/lib/setting-primitives";

// Tema & branding (site_settings.theme_settings, migrasi v106).
// File ini murni: dipakai server (CSS + metadata), API (validasi), dan
// komponen admin (pratinjau + pemeriksa kontras).
//
// Keamanan: admin hanya boleh mengirim warna hex. Variabel CSS yang ditulis ke
// halaman berasal dari daftar tetap di buildThemeCss — nama variabel tidak
// pernah diambil dari input, jadi tidak ada jalur menyisipkan CSS lain.

export const THEME_SETTINGS_KEY = "theme_settings";

export const THEME_FONT_KEYS = ["system", "jakarta", "inter", "nunito"] as const;
export const THEME_RADIUS_KEYS = ["small", "medium", "large"] as const;
export const THEME_CARD_STYLES = ["flat", "shadow"] as const;
// Kunci lama (blue-green, neutral) tetap diterima agar tema yang sudah
// diterbitkan tidak gagal validasi; daftar preset di UI hanya tiga tema baru.
export const THEME_PRESET_KEYS = ["neon-blue", "gold-dark", "fresh-green", "blue-green", "neutral", "custom"] as const;
export const THEME_HERO_PRESET_KEYS = ["gelap-biru", "gelap-emas", "gelap-hijau", "custom"] as const;

export type ThemeFontKey = (typeof THEME_FONT_KEYS)[number];
export type ThemeRadiusKey = (typeof THEME_RADIUS_KEYS)[number];
export type ThemeCardStyle = (typeof THEME_CARD_STYLES)[number];
export type ThemePresetKey = (typeof THEME_PRESET_KEYS)[number];
export type ThemeHeroPresetKey = (typeof THEME_HERO_PRESET_KEYS)[number];

export const THEME_FONTS: ReadonlyArray<{ key: ThemeFontKey; label: string; stack: string }> = [
  {
    key: "system",
    label: "Sistem (bawaan perangkat)",
    stack: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  { key: "jakarta", label: "Plus Jakarta Sans", stack: 'var(--font-jakarta), ui-sans-serif, system-ui, sans-serif' },
  { key: "inter", label: "Inter", stack: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif' },
  { key: "nunito", label: "Nunito", stack: 'var(--font-nunito), ui-sans-serif, system-ui, sans-serif' },
];

export const THEME_RADII: Record<ThemeRadiusKey, { label: string; card: string; button: string }> = {
  small: { label: "Kecil", card: "0.75rem", button: "0.625rem" },
  medium: { label: "Sedang", card: "1rem", button: "0.75rem" },
  large: { label: "Besar", card: "1.25rem", button: "0.875rem" },
};

export const THEME_CARD_STYLE_LABEL: Record<ThemeCardStyle, string> = {
  flat: "Datar (tanpa bayangan)",
  shadow: "Bayangan halus",
};

export type ThemeColors = {
  primary: string;
  accent: string;
  background: string;
  card: string;
  card2: string;
  border: string;
  text: string;
  success: string;
  warning: string;
  danger: string;
};

export type ThemeHeroColors = {
  bgFrom: string;
  bgTo: string;
  text: string;
  textMuted: string;
  accent: string;
};

export type ThemeSettings = {
  identity: {
    shopName: string;
    tagline: string;
    logoLight: string;
    logoDark: string;
    faviconUrl: string;
    ogImageUrl: string;
  };
  light: ThemeColors;
  dark: ThemeColors;
  /** Satu set warna kartu hero, berlaku untuk mode terang dan gelap. */
  hero: ThemeHeroColors;
  heroPreset: ThemeHeroPresetKey;
  font: ThemeFontKey;
  radius: ThemeRadiusKey;
  cardStyle: ThemeCardStyle;
  preset: ThemePresetKey;
};

// Nilai bawaan "Biru Neon": biru neon + aksen hijau di atas latar biru-gelap.
// Semua warna di bawah juga dipakai sebagai fallback bila pengaturan belum ada.
export const DEFAULT_THEME_COLORS: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    primary: "#1573D1",
    accent: "#7BD32A",
    background: "#F3F6FB",
    card: "#FFFFFF",
    card2: "#EEF3FA",
    border: "#E1E8F2",
    text: "#0F172A",
    success: "#059669",
    warning: "#D97706",
    danger: "#DC2626",
  },
  dark: {
    primary: "#3AA7FF",
    accent: "#8CD93A",
    background: "#070B14",
    card: "#0F1626",
    card2: "#151E33",
    border: "#1E2A44",
    text: "#F1F5F9",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#F87171",
  },
};

export const DEFAULT_HERO_COLORS: ThemeHeroColors = {
  bgFrom: "#0b1220",
  bgTo: "#123a66",
  // Teks redup dirender sebagai rgba(teks, 0.72) oleh heroCssVariables.
  text: "#ffffff",
  textMuted: "#ffffff",
  accent: "#5cc0ff",
};

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  identity: {
    shopName: "AIDIL STORE",
    tagline: "Pulsa, data, game, e-wallet, tagihan, dan voucher dalam satu akun.",
    logoLight: "",
    logoDark: "",
    faviconUrl: "",
    ogImageUrl: "",
  },
  light: DEFAULT_THEME_COLORS.light,
  dark: DEFAULT_THEME_COLORS.dark,
  hero: DEFAULT_HERO_COLORS,
  heroPreset: "gelap-biru",
  font: "inter",
  radius: "large",
  cardStyle: "shadow",
  preset: "neon-blue",
};

// =========================================================
// Warna: hex -> RGB, kontras WCAG
// =========================================================

export function normalizeHexColor(input: string): string | null {
  const value = String(input || "").trim();
  const match = /^#([0-9a-fA-F]{3,8})$/.exec(value);
  if (!match) return null;
  let hex = match[1].toLowerCase();
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split("")
      .map((char) => char + char)
      .join("");
  } else if (hex.length === 6 || hex.length === 8) {
    hex = hex.slice(0, 6);
  } else {
    return null;
  }
  return `#${hex}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Campur dua warna; weight = porsi warna pertama (0..1). */
export function mixHex(first: string, second: string, weight: number): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  if (!a || !b) return first;
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(a.r * w + b.r * (1 - w), a.g * w + b.g * (1 - w), a.b * w + b.b * (1 - w));
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

export function contrastRatio(first: string, second: string): number {
  const l1 = relativeLuminance(first);
  const l2 = relativeLuminance(second);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Geser warna menuju hitam/putih sampai rasio terhadap latar memenuhi target. */
export function ensureContrast(foreground: string, background: string, target = 4.5): string {
  const fg = normalizeHexColor(foreground) ?? "#000000";
  const bg = normalizeHexColor(background) ?? "#FFFFFF";
  if (contrastRatio(fg, bg) >= target) return fg;
  const toward = relativeLuminance(bg) > 0.35 ? "#000000" : "#FFFFFF";
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixHex(toward, fg, step / 20);
    if (contrastRatio(candidate, bg) >= target) return candidate;
  }
  return toward;
}

export function bestTextColor(background: string): string {
  return contrastRatio("#FFFFFF", background) >= contrastRatio("#09090B", background) ? "#FFFFFF" : "#09090B";
}

/** Untuk disisipkan ke CSS sebagai triplet "r g b" (Tailwind memakai rgb(var()/alpha)). */
export function rgbTriplet(hex: string): string {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  return `${rgb.r} ${rgb.g} ${rgb.b}`;
}

// =========================================================
// Preset
// =========================================================

type PresetDefinition = {
  key: Exclude<ThemePresetKey, "custom">;
  label: string;
  description: string;
  recommended?: boolean;
  light: ThemeColors;
  dark: ThemeColors;
};

export const THEME_PRESETS: ReadonlyArray<PresetDefinition> = [
  {
    key: "neon-blue",
    label: "Biru Neon",
    description: "Rekomendasi: biru neon di atas latar biru-gelap dengan aksen hijau muda.",
    recommended: true,
    light: DEFAULT_THEME_COLORS.light,
    dark: DEFAULT_THEME_COLORS.dark,
  },
  {
    key: "gold-dark",
    label: "Emas Gelap",
    description: "Nuansa emas hangat dengan latar gelap pekat.",
    light: {
      primary: "#A8760A",
      accent: "#B8860B",
      background: "#FFF9E8",
      card: "#FFFFFF",
      card2: "#FBF1D6",
      border: "#EAD9A8",
      text: "#2A1F00",
      success: "#2E7D32",
      warning: "#B45309",
      danger: "#B91C1C",
    },
    dark: {
      primary: "#E3B341",
      accent: "#D4A72C",
      background: "#0D0B06",
      card: "#1A160C",
      card2: "#241E10",
      border: "#3A3018",
      text: "#F7EFD2",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#F87171",
    },
  },
  {
    key: "fresh-green",
    label: "Hijau Segar",
    description: "Hijau segar yang tenang untuk tampilan ramah lingkungan.",
    light: {
      primary: "#15803D",
      accent: "#84CC16",
      background: "#F4F9F3",
      card: "#FFFFFF",
      card2: "#EAF4E8",
      border: "#D8E7D5",
      text: "#0F1F14",
      success: "#059669",
      warning: "#D97706",
      danger: "#DC2626",
    },
    dark: {
      primary: "#4ADE80",
      accent: "#A3E635",
      background: "#06120B",
      card: "#0D1F14",
      card2: "#122A1B",
      border: "#1E3A2A",
      text: "#F0FDF4",
      success: "#34D399",
      warning: "#FBBF24",
      danger: "#F87171",
    },
  },
];

export function applyThemePreset(settings: ThemeSettings, key: ThemePresetKey): ThemeSettings {
  const preset = THEME_PRESETS.find((entry) => entry.key === key);
  if (!preset) return { ...settings, preset: "custom" };
  return {
    ...settings,
    light: { ...preset.light },
    dark: { ...preset.dark },
    preset: preset.key,
  };
}

/**
 * Nilai rekomendasi lengkap (warna + huruf + radius + kartu + hero).
 * Identitas toko sengaja dipertahankan; hasilnya dipakai tombol
 * "Terapkan tema rekomendasi" untuk mengisi draf baru.
 */
export function recommendedThemeSettings(settings: ThemeSettings): ThemeSettings {
  return {
    ...settings,
    light: { ...DEFAULT_THEME_COLORS.light },
    dark: { ...DEFAULT_THEME_COLORS.dark },
    hero: { ...DEFAULT_HERO_COLORS },
    heroPreset: "gelap-biru",
    font: "inter",
    radius: "large",
    cardStyle: "shadow",
    preset: "neon-blue",
  };
}

type HeroPresetDefinition = {
  key: Exclude<ThemeHeroPresetKey, "custom">;
  label: string;
  description: string;
  colors: ThemeHeroColors;
};

export const THEME_HERO_PRESETS: ReadonlyArray<HeroPresetDefinition> = [
  {
    key: "gelap-biru",
    label: "Gelap Biru",
    description: "Biru malam dengan aksen langit cerah. Bawaan untuk semua tema.",
    colors: DEFAULT_HERO_COLORS,
  },
  {
    key: "gelap-emas",
    label: "Gelap Emas",
    description: "Hitam pekat berpadu emas hangat.",
    colors: {
      bgFrom: "#0a0a0a",
      bgTo: "#3a2a05",
      text: "#ffffff",
      textMuted: "#e2d6bc",
      accent: "#e5b53a",
    },
  },
  {
    key: "gelap-hijau",
    label: "Gelap Hijau",
    description: "Hijau hutan dalam dengan aksen mint.",
    colors: {
      bgFrom: "#06150f",
      bgTo: "#0f3d2a",
      text: "#ffffff",
      textMuted: "#c6d6c9",
      accent: "#8cd93a",
    },
  },
];

export function applyHeroPreset(settings: ThemeSettings, key: ThemeHeroPresetKey): ThemeSettings {
  const preset = THEME_HERO_PRESETS.find((entry) => entry.key === key);
  if (!preset) return { ...settings, heroPreset: "custom" };
  return {
    ...settings,
    hero: { ...preset.colors },
    heroPreset: preset.key,
  };
}

// =========================================================
// Skema
// =========================================================

// card2 & border opsional agar pengaturan terbit lama (sebelum v109) tetap
// terbaca; normalisasi menurunkan nilainya dari warna yang sudah ada.
const colorSetSchema = z.object({
  primary: hexColorSchema,
  accent: hexColorSchema,
  background: hexColorSchema,
  card: hexColorSchema,
  card2: hexColorSchema.optional(),
  border: hexColorSchema.optional(),
  text: hexColorSchema,
  success: hexColorSchema,
  warning: hexColorSchema,
  danger: hexColorSchema,
});

const heroColorSetSchema = z.object({
  bgFrom: hexColorSchema,
  bgTo: hexColorSchema,
  text: hexColorSchema,
  textMuted: hexColorSchema,
  accent: hexColorSchema,
});

const identitySchema = z.object({
  shopName: z.string().trim().min(1, "Nama toko wajib diisi.").max(60, "Nama toko maksimal 60 karakter."),
  tagline: z.string().trim().max(160, "Tagline maksimal 160 karakter."),
  logoLight: z.string().trim().max(500),
  logoDark: z.string().trim().max(500),
  faviconUrl: z.string().trim().max(500),
  ogImageUrl: z.string().trim().max(500),
});

export const themeSettingsInputSchema = z.object({
  identity: identitySchema.default(DEFAULT_THEME_SETTINGS.identity),
  light: colorSetSchema.default(DEFAULT_THEME_SETTINGS.light),
  dark: colorSetSchema.default(DEFAULT_THEME_SETTINGS.dark),
  hero: heroColorSetSchema.default(DEFAULT_HERO_COLORS),
  heroPreset: z.enum(THEME_HERO_PRESET_KEYS).default("gelap-biru"),
  font: z.enum(THEME_FONT_KEYS).default("inter"),
  radius: z.enum(THEME_RADIUS_KEYS).default("large"),
  cardStyle: z.enum(THEME_CARD_STYLES).default("shadow"),
  preset: z.enum(THEME_PRESET_KEYS).default("neon-blue"),
});

type ColorSetInput = Omit<ThemeColors, "card2" | "border"> & { card2?: string; border?: string };

function normalizeColorSet(colors: ColorSetInput): ThemeColors {
  const fix = (value: string | undefined, fallback: string) => normalizeHexColor(value ?? "") ?? fallback;
  const primary = fix(colors.primary, "#1573D1");
  const accent = fix(colors.accent, "#7BD32A");
  const background = fix(colors.background, "#F3F6FB");
  const card = fix(colors.card, "#FFFFFF");
  const text = fix(colors.text, "#0F172A");
  return {
    primary,
    accent,
    background,
    card,
    card2: fix(colors.card2, mixHex(card, background, 0.35)),
    border: fix(colors.border, mixHex(text, card, 0.16)),
    text,
    success: fix(colors.success, "#059669"),
    warning: fix(colors.warning, "#D97706"),
    danger: fix(colors.danger, "#DC2626"),
  };
}

function normalizeHeroColors(colors: ThemeHeroColors): ThemeHeroColors {
  const fix = (value: string, fallback: string) => normalizeHexColor(value) ?? fallback;
  return {
    bgFrom: fix(colors.bgFrom, DEFAULT_HERO_COLORS.bgFrom),
    bgTo: fix(colors.bgTo, DEFAULT_HERO_COLORS.bgTo),
    text: fix(colors.text, DEFAULT_HERO_COLORS.text),
    textMuted: fix(colors.textMuted, DEFAULT_HERO_COLORS.textMuted),
    accent: fix(colors.accent, DEFAULT_HERO_COLORS.accent),
  };
}

function validAssetUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeThemeSettings(value: z.infer<typeof themeSettingsInputSchema>): ThemeSettings {
  return {
    identity: {
      shopName: value.identity.shopName.trim(),
      tagline: value.identity.tagline.trim(),
      logoLight: validAssetUrl(value.identity.logoLight),
      logoDark: validAssetUrl(value.identity.logoDark),
      faviconUrl: validAssetUrl(value.identity.faviconUrl),
      ogImageUrl: validAssetUrl(value.identity.ogImageUrl),
    },
    light: normalizeColorSet(value.light as ColorSetInput),
    dark: normalizeColorSet(value.dark as ColorSetInput),
    hero: normalizeHeroColors(value.hero as ThemeHeroColors),
    heroPreset: value.heroPreset,
    font: value.font,
    radius: value.radius,
    cardStyle: value.cardStyle,
    preset: value.preset,
  };
}

// =========================================================
// Kontras
// =========================================================

export type ContrastCheck = {
  mode: "light" | "dark" | "hero";
  modeLabel: string;
  label: string;
  ratio: number;
  pass: boolean;
};

export const MIN_CONTRAST = 4.5;

/** Semua pasangan teks-utama yang diperiksa di UI admin. */
export function themeContrastChecks(settings: ThemeSettings): ContrastCheck[] {
  const checks: ContrastCheck[] = [];
  for (const mode of ["light", "dark"] as const) {
    const colors = settings[mode];
    const modeLabel = mode === "light" ? "Terang" : "Gelap";
    const muted = ensureContrast(mixHex(colors.text, colors.background, 0.72), colors.background, MIN_CONTRAST);
    const pairs = [
      { label: "Teks pada latar", fore: colors.text, back: colors.background },
      { label: "Teks pada kartu", fore: colors.text, back: colors.card },
      { label: "Teks pada kartu sekunder", fore: colors.text, back: colors.card2 },
      { label: "Teks redup pada latar", fore: muted, back: colors.background },
      { label: "Teks tombol utama", fore: bestTextColor(colors.primary), back: colors.primary },
      { label: "Teks tombol aksen", fore: bestTextColor(colors.accent), back: colors.accent },
    ];
    for (const pair of pairs) {
      const ratio = contrastRatio(pair.fore, pair.back);
      checks.push({
        mode,
        modeLabel,
        label: pair.label,
        ratio: Math.round(ratio * 100) / 100,
        pass: ratio >= MIN_CONTRAST,
      });
    }
  }

  // Hero selalu gelap di kedua mode: teks harus terbaca di warna awal dan
  // akhir gradasi (bagian paling terang dan paling gelap).
  const hero = settings.hero ?? DEFAULT_HERO_COLORS;
  const heroMutedStart = mixHex(hero.textMuted, hero.bgFrom, 0.72);
  const heroMutedEnd = mixHex(hero.textMuted, hero.bgTo, 0.72);
  const heroPairs = [
    { label: "Teks hero pada latar awal", fore: hero.text, back: hero.bgFrom },
    { label: "Teks hero pada latar akhir", fore: hero.text, back: hero.bgTo },
    { label: "Teks redup hero pada latar awal", fore: heroMutedStart, back: hero.bgFrom },
    { label: "Teks redup hero pada latar akhir", fore: heroMutedEnd, back: hero.bgTo },
  ];
  for (const pair of heroPairs) {
    const ratio = contrastRatio(pair.fore, pair.back);
    checks.push({
      mode: "hero",
      modeLabel: "Hero",
      label: pair.label,
      ratio: Math.round(ratio * 100) / 100,
      pass: ratio >= MIN_CONTRAST,
    });
  }
  return checks;
}

/** Cegah Terbitkan bila teks utama tidak lolos 4,5:1. */
export function themePublishError(settings: ThemeSettings): string | null {
  const failed = themeContrastChecks(settings).filter((check) => !check.pass);
  if (failed.length === 0) return null;
  const first = failed[0];
  return `Kontras ${first.label.toLowerCase()} mode ${first.modeLabel.toLowerCase()} baru ${first.ratio}:1, minimal ${MIN_CONTRAST}:1. Perbaiki warna teks atau latar sebelum menerbitkan.`;
}

// =========================================================
// CSS dari server
// =========================================================

export const THEME_CSS_VARIABLES = [
  "--bg",
  "--card",
  "--card-2",
  "--text",
  "--muted",
  "--border",
  "--primary",
  "--primary-contrast",
  "--accent",
  "--accent-contrast",
  "--success",
  "--warning",
  "--danger",
  "--danger-contrast",
  "--app-bg",
  "--app-surface",
  "--app-inset",
  "--app-border",
  "--app-text",
  "--app-muted",
  "--app-subtle",
  "--app-accent",
  "--app-accent-soft",
  "--app-kicker",
  "--app-hero-bg",
  "--app-success",
  "--app-warning",
  "--app-danger",
  "--theme-primary",
  "--theme-primary-strong",
  "--theme-primary-rgb",
  "--theme-accent",
  "--theme-accent-strong",
  "--theme-accent-rgb",
  "--theme-on-primary",
  "--theme-on-accent",
  "--app-font",
  "--app-radius-card",
  "--app-radius-button",
  "--app-card-shadow",
  "--hero-bg-from",
  "--hero-bg-to",
  "--hero-glow",
  "--hero-text",
  "--hero-text-muted",
  "--hero-divider",
  "--hero-chip-bg",
  "--hero-chip-border",
  "--hero-accent",
] as const;

type ModeVars = Record<string, string>;

function modeVariables(colors: ThemeColors): ModeVars {
  const kicker = ensureContrast(colors.primary, colors.background, MIN_CONTRAST);
  const muted = ensureContrast(mixHex(colors.text, colors.background, 0.72), colors.background, MIN_CONTRAST);
  const subtle = ensureContrast(mixHex(colors.text, colors.background, 0.55), colors.background, MIN_CONTRAST);
  const primaryStrong = mixHex(colors.primary, "#000000", 0.82);
  const accentStrong = mixHex(colors.accent, "#000000", 0.82);
  const primaryContrast = bestTextColor(colors.primary);
  const accentContrast = bestTextColor(colors.accent);
  return {
    // Variabel kanonis (dipakai komponen baru & dokumentasi tema).
    "--bg": colors.background,
    "--card": colors.card,
    "--card-2": colors.card2,
    "--text": colors.text,
    "--muted": muted,
    "--border": colors.border,
    "--primary": colors.primary,
    "--primary-contrast": primaryContrast,
    "--accent": colors.accent,
    "--accent-contrast": accentContrast,
    "--success": colors.success,
    "--warning": colors.warning,
    "--danger": colors.danger,
    "--danger-contrast": bestTextColor(colors.danger),
    // Lapisan lama: RGB triplet agar utility Tailwind rgb(var()/alpha) tetap jalan.
    "--app-bg": rgbTriplet(colors.background),
    "--app-surface": rgbTriplet(colors.card),
    "--app-inset": rgbTriplet(colors.card2),
    "--app-border": rgbTriplet(colors.border),
    "--app-text": rgbTriplet(colors.text),
    "--app-muted": rgbTriplet(muted),
    "--app-subtle": rgbTriplet(subtle),
    "--app-accent": rgbTriplet(colors.primary),
    "--app-accent-soft": rgbTriplet(mixHex(colors.primary, colors.card, 0.1)),
    "--app-kicker": rgbTriplet(kicker),
    "--app-hero-bg": rgbTriplet(colors.background),
    "--app-success": rgbTriplet(colors.success),
    "--app-warning": rgbTriplet(colors.warning),
    "--app-danger": rgbTriplet(colors.danger),
    "--theme-primary": colors.primary,
    "--theme-primary-strong": primaryStrong,
    "--theme-primary-rgb": rgbTriplet(colors.primary),
    "--theme-accent": colors.accent,
    "--theme-accent-strong": accentStrong,
    "--theme-accent-rgb": rgbTriplet(colors.accent),
    "--theme-on-primary": primaryContrast,
    "--theme-on-accent": accentContrast,
  };
}

/**
 * Variabel hero diturunkan dari 5 warna hex tervalidasi. Glow/divider/chip
 * memakai alpha supaya tetap menyatu dengan latar gelap apa pun.
 */
export function heroCssVariables(hero: ThemeHeroColors): Record<string, string> {
  const safe = normalizeHeroColors(hero);
  const text = hexToRgb(safe.text) ?? { r: 255, g: 255, b: 255 };
  const muted = hexToRgb(safe.textMuted) ?? text;
  const accent = hexToRgb(safe.accent) ?? { r: 92, g: 192, b: 255 };
  return {
    "--hero-bg-from": safe.bgFrom,
    "--hero-bg-to": safe.bgTo,
    "--hero-glow": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.28)`,
    "--hero-text": safe.text,
    "--hero-text-muted": `rgba(${muted.r}, ${muted.g}, ${muted.b}, 0.72)`,
    "--hero-divider": `rgba(${text.r}, ${text.g}, ${text.b}, 0.12)`,
    "--hero-chip-bg": `rgba(${text.r}, ${text.g}, ${text.b}, 0.1)`,
    "--hero-chip-border": `rgba(${text.r}, ${text.g}, ${text.b}, 0.18)`,
    "--hero-accent": safe.accent,
  };
}

function cardShadow(style: ThemeSettings["cardStyle"]): string {
  return style === "flat" ? "none" : "0 8px 24px rgba(9, 9, 11, .08)";
}

/**
 * Petakan warna satu mode ke variabel perantara --theme-<mode>-<nama>.
 * Nilai cadangannya adalah default "Biru Neon" sehingga halaman tetap benar
 * bila style inline pada <html> belum sempat diterapkan.
 */
function paletteMapping(vars: ModeVars, mode: "light" | "dark"): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: var(--theme-${mode}-${name.slice(2)}, ${value});`)
    .join(" ");
}

const DEFAULT_LIGHT_VARS = modeVariables(DEFAULT_THEME_COLORS.light);
const DEFAULT_DARK_VARS = modeVariables(DEFAULT_THEME_COLORS.dark);

/**
 * Satu-satunya nilai warna tema yang dikirim server: dipasang sebagai style
 * inline pada <html> di root layout. Palet terang dan gelap dikirim sekaligus,
 * lalu CSS memetakannya sesuai class mode aktif. Style inline tidak bisa
 * ditimpa aturan .dark, jadi pemisahan per mode ini wajib.
 */
export function themeHtmlVariables(settings: ThemeSettings): Record<string, string> {
  const font = THEME_FONTS.find((entry) => entry.key === settings.font) ?? THEME_FONTS[0];
  const radius = THEME_RADII[settings.radius] ?? THEME_RADII.large;
  const vars: Record<string, string> = {
    ...heroCssVariables(settings.hero ?? DEFAULT_HERO_COLORS),
    "--app-font": font.stack,
    "--app-radius-card": radius.card,
    "--app-radius-button": radius.button,
    "--theme-card-shadow-light": cardShadow(settings.cardStyle),
    "--theme-card-shadow-dark": "none",
  };
  for (const [mode, colors] of [["light", settings.light], ["dark", settings.dark]] as const) {
    for (const [name, value] of Object.entries(modeVariables(colors))) {
      vars[`--theme-${mode}-${name.slice(2)}`] = value;
    }
  }
  return vars;
}

/**
 * CSS struktural yang disisipkan server pada <head>. Isinya sengaja bebas dari
 * nilai warna terbit: warna hanya dibaca lewat variabel perantara dari style
 * inline <html>, sehingga payload navigasi yang lama tidak bisa mengubah palet.
 * Semua nilai berasal dari enum font/radius; tidak ada input mentah.
 */
export function buildThemeCss(settings: ThemeSettings): string {
  const font = THEME_FONTS.find((entry) => entry.key === settings.font) ?? THEME_FONTS[0];
  const radius = THEME_RADII[settings.radius] ?? THEME_RADII.large;
  return [
    `html:root { ${paletteMapping(DEFAULT_LIGHT_VARS, "light")} --app-font: ${font.stack}; --app-radius-card: ${radius.card}; --app-radius-button: ${radius.button}; --app-card-shadow: var(--theme-card-shadow-light, ${cardShadow(settings.cardStyle)}); }`,
    `html.dark { ${paletteMapping(DEFAULT_DARK_VARS, "dark")} --app-card-shadow: var(--theme-card-shadow-dark, none); }`,
    `html body { font-family: var(--app-font); }`,
    `.theme-card { border-radius: var(--app-radius-card); box-shadow: var(--app-card-shadow); }`,
    // CTA utama: bidang warna utama + teks kontras; server mengalahkan fallback statis.
    `html .btn-gold { background-color: var(--primary); background-image: linear-gradient(180deg, rgba(255, 255, 255, .16) 0%, rgba(255, 255, 255, 0) 55%); background-blend-mode: normal; color: var(--primary-contrast); border-radius: var(--app-radius-button); }`,
    `html .btn-gold:disabled { background-image: none; }`,
    `html .btn-gold-metal, html .brand-button { background-color: var(--accent); background-image: linear-gradient(135deg, var(--accent) 0%, var(--theme-accent-strong) 100%); color: var(--accent-contrast); }`,
    `html .brand-yellow { color: var(--accent); }`,
    `html .app-hero { color: var(--hero-text); background: radial-gradient(circle at 80% 15%, var(--hero-glow), transparent 34%), linear-gradient(135deg, var(--hero-bg-from) 0%, var(--hero-bg-to) 100%); }`,
  ].join("\n");
}

/** Variabel untuk pratinjau lokal 360px (tanpa mengubah halaman admin). */
export function themePreviewStyle(colors: ThemeColors, settings: ThemeSettings): Record<string, string> {
  const font = THEME_FONTS.find((entry) => entry.key === settings.font) ?? THEME_FONTS[0];
  const radius = THEME_RADII[settings.radius] ?? THEME_RADII.large;
  return {
    ...modeVariables(colors),
    ...heroCssVariables(settings.hero ?? DEFAULT_HERO_COLORS),
    "--app-font": font.stack,
    "--app-radius-card": radius.card,
    "--app-radius-button": radius.button,
    "--app-card-shadow": settings.cardStyle === "flat" ? "none" : "0 8px 24px rgba(9, 9, 11, .08)",
    backgroundColor: colors.background,
    color: colors.text,
    fontFamily: font.stack,
  };
}
