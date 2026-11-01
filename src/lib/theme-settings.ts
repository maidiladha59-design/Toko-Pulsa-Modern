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
export const THEME_PRESET_KEYS = ["blue-green", "gold-dark", "neutral", "custom"] as const;
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

export const THEME_RADII: Record<ThemeRadiusKey, { label: string; card: string }> = {
  small: { label: "Kecil", card: "0.75rem" },
  medium: { label: "Sedang", card: "1rem" },
  large: { label: "Besar", card: "1.5rem" },
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

export const DEFAULT_THEME_COLORS: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    primary: "#2E9EF5",
    accent: "#8CD93A",
    background: "#FAF9F6",
    card: "#FFFFFF",
    text: "#18181B",
    success: "#059669",
    warning: "#D97706",
    danger: "#DC2626",
  },
  dark: {
    primary: "#2E9EF5",
    accent: "#8CD93A",
    background: "#09090B",
    card: "#18181B",
    text: "#F4F4F5",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
  },
};

export const DEFAULT_HERO_COLORS: ThemeHeroColors = {
  bgFrom: "#0b1220",
  bgTo: "#123a66",
  text: "#ffffff",
  textMuted: "#c3cedb",
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
  font: "system",
  radius: "large",
  cardStyle: "shadow",
  preset: "blue-green",
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
  light: ThemeColors;
  dark: ThemeColors;
};

export const THEME_PRESETS: ReadonlyArray<PresetDefinition> = [
  {
    key: "blue-green",
    label: "Biru Hijau",
    description: "Mengikuti maskot: biru listrik + hijau muda di atas latar gelap.",
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
      text: "#F7EFD2",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#F87171",
    },
  },
  {
    key: "neutral",
    label: "Netral",
    description: "Abu-abu tenang, cocok bila ingin tampilan tanpa aksen mencolok.",
    light: {
      primary: "#3F3F46",
      accent: "#71717A",
      background: "#FAFAFA",
      card: "#FFFFFF",
      text: "#18181B",
      success: "#047857",
      warning: "#B45309",
      danger: "#B91C1C",
    },
    dark: {
      primary: "#D4D4D8",
      accent: "#A1A1AA",
      background: "#09090B",
      card: "#18181B",
      text: "#F4F4F5",
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

const colorSetSchema = z.object({
  primary: hexColorSchema,
  accent: hexColorSchema,
  background: hexColorSchema,
  card: hexColorSchema,
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
  font: z.enum(THEME_FONT_KEYS).default("system"),
  radius: z.enum(THEME_RADIUS_KEYS).default("large"),
  cardStyle: z.enum(THEME_CARD_STYLES).default("shadow"),
  preset: z.enum(THEME_PRESET_KEYS).default("blue-green"),
});

function normalizeColorSet(colors: ThemeColors): ThemeColors {
  const fix = (value: string, fallback: string) => normalizeHexColor(value) ?? fallback;
  return {
    primary: fix(colors.primary, "#2E9EF5"),
    accent: fix(colors.accent, "#8CD93A"),
    background: fix(colors.background, "#FAF9F6"),
    card: fix(colors.card, "#FFFFFF"),
    text: fix(colors.text, "#18181B"),
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
    light: normalizeColorSet(value.light as ThemeColors),
    dark: normalizeColorSet(value.dark as ThemeColors),
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
    const pairs = [
      { label: "Teks pada latar", fore: colors.text, back: colors.background },
      { label: "Teks pada kartu", fore: colors.text, back: colors.card },
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
  const heroPairs = [
    { label: "Teks hero pada latar awal", back: hero.bgFrom },
    { label: "Teks hero pada latar akhir", back: hero.bgTo },
  ];
  for (const pair of heroPairs) {
    const ratio = contrastRatio(hero.text, pair.back);
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
  const primaryStrong = mixHex("#000000", colors.primary, 0.85);
  const accentStrong = mixHex("#000000", colors.accent, 0.85);
  return {
    "--app-bg": rgbTriplet(colors.background),
    "--app-surface": rgbTriplet(colors.card),
    "--app-inset": rgbTriplet(mixHex(colors.card, colors.background, 0.5)),
    "--app-border": rgbTriplet(mixHex(colors.text, colors.card, 0.16)),
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
    "--theme-on-primary": bestTextColor(primaryStrong),
    "--theme-on-accent": bestTextColor(colors.accent),
  };
}

function variablesToCss(vars: ModeVars): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
}

/**
 * Variabel hero diturunkan dari 5 warna hex tervalidasi. Glow/divider/chip
 * memakai alpha supaya tetap menyatu dengan latar gelap apa pun.
 */
export function heroCssVariables(hero: ThemeHeroColors): Record<string, string> {
  const safe = normalizeHeroColors(hero);
  const text = hexToRgb(safe.text) ?? { r: 255, g: 255, b: 255 };
  const accent = hexToRgb(safe.accent) ?? { r: 92, g: 192, b: 255 };
  return {
    "--hero-bg-from": safe.bgFrom,
    "--hero-bg-to": safe.bgTo,
    "--hero-glow": `rgba(${accent.r}, ${accent.g}, ${accent.b}, 0.25)`,
    "--hero-text": safe.text,
    "--hero-text-muted": safe.textMuted,
    "--hero-divider": `rgba(${text.r}, ${text.g}, ${text.b}, 0.12)`,
    "--hero-chip-bg": `rgba(${text.r}, ${text.g}, ${text.b}, 0.1)`,
    "--hero-chip-border": `rgba(${text.r}, ${text.g}, ${text.b}, 0.18)`,
    "--hero-accent": safe.accent,
  };
}

/**
 * CSS yang disisipkan server pada <head>. Semua nilai berasal dari hex yang
 * sudah divalidasi dan font/radius dari enum; tidak ada input mentah.
 */
export function buildThemeCss(settings: ThemeSettings): string {
  const font = THEME_FONTS.find((entry) => entry.key === settings.font) ?? THEME_FONTS[0];
  const radius = THEME_RADII[settings.radius] ?? THEME_RADII.large;
  const shadow =
    settings.cardStyle === "flat"
      ? "none"
      : "0 8px 24px rgba(9, 9, 11, .08)";
  const shared = `--app-font: ${font.stack}; --app-radius-card: ${radius.card}; --app-card-shadow: ${shadow};`;
  const hero = heroCssVariables(settings.hero ?? DEFAULT_HERO_COLORS);
  return [
    `html:root { ${variablesToCss(modeVariables(settings.light))} ${variablesToCss(hero)} ${shared} }`,
    `html.dark { ${variablesToCss(modeVariables(settings.dark))} }`,
    `html body { font-family: var(--app-font); }`,
    `.theme-card { border-radius: var(--app-radius-card); box-shadow: var(--app-card-shadow); }`,
    // CTA mengikuti warna utama tanpa mengubah berkas globals.css (kontrak v92).
    `html .btn-gold { background-image: linear-gradient(135deg, var(--theme-primary-strong) 0%, var(--theme-primary) 100%), linear-gradient(180deg, rgba(255, 255, 255, .22) 0%, rgba(255, 255, 255, 0) 50%); color: var(--theme-on-primary); }`,
    `html .btn-gold:disabled { background-image: linear-gradient(135deg, var(--theme-primary-strong) 0%, var(--theme-primary) 100%); }`,
    `html .btn-gold-metal, html .brand-button { background-color: var(--theme-accent); background-image: linear-gradient(135deg, var(--theme-accent) 0%, var(--theme-accent-strong) 100%); color: var(--theme-on-accent); }`,
    `html .brand-yellow { color: var(--theme-accent); }`,
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
    "--app-card-shadow": settings.cardStyle === "flat" ? "none" : "0 8px 24px rgba(9, 9, 11, .08)",
    backgroundColor: colors.background,
    color: colors.text,
    fontFamily: font.stack,
  };
}
