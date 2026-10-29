import { z } from "zod";

// Bagian murni dari pengaturan situs (tabel public.site_settings, migrasi v98)
// yang aman dipakai komponen client maupun server: konstanta, tipe, default,
// dan validasi. Pembacaan dari database ada di src/lib/site-settings.ts supaya
// modul server (next/cache, supabase) tidak ikut masuk bundel browser.
//
// Aturan:
//  - Teks ticker selalu dirender sebagai teks biasa (lihat InfoTicker.tsx),
//    tidak pernah sebagai HTML.
//  - Link hanya path internal atau https.

export const SITE_SETTINGS_TAG = "site-settings";
export const INFO_TICKER_KEY = "info_ticker";

export const TICKER_TEXT_MAX = 300;
export const TICKER_SPEED_MIN = 10;
export const TICKER_SPEED_MAX = 120;
export const TICKER_SPEED_DEFAULT = 40;
export const TICKER_GAP_MIN = 16;
export const TICKER_GAP_MAX = 160;
export const TICKER_GAP_DEFAULT = 48;

export type TickerIcon = "megaphone" | "bell" | "star" | "none";
export type TickerStyle = "default" | "emas" | "peringatan";
export type TickerDirection = "left" | "right";

export type InfoTickerSettings = {
  enabled: boolean;
  text: string;
  speed: number;
  direction: TickerDirection;
  pause_on_touch: boolean;
  gap: number;
  link_url: string | null;
  icon: TickerIcon;
  style: TickerStyle;
  start_at: string | null;
  end_at: string | null;
};

export const DEFAULT_INFO_TICKER: InfoTickerSettings = {
  enabled: true,
  text: "",
  speed: TICKER_SPEED_DEFAULT,
  direction: "left",
  pause_on_touch: true,
  gap: TICKER_GAP_DEFAULT,
  link_url: null,
  icon: "megaphone",
  style: "default",
  start_at: null,
  end_at: null,
};

/** Link hanya boleh path internal atau https — tidak ada javascript:/data:. */
export function isAllowedTickerLink(value: string): boolean {
  if (value === "") return true;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return !value.includes("\\");
  return /^https:\/\/[^\s]+$/.test(value);
}

const optionalLink = z
  .union([z.string(), z.null()])
  .nullable()
  .refine((v) => v === null || isAllowedTickerLink(v.trim()), {
    message: "Link hanya boleh alamat internal (diawali /) atau https.",
  });

/** Tanggal jadwal diterima sebagai string tanggal-waktu dan disimpan sebagai ISO. */
const optionalDate = z
  .union([z.string(), z.null()])
  .nullable()
  .refine((v) => v === null || v.trim() === "" || !Number.isNaN(Date.parse(v)), {
    message: "Format jadwal tidak valid.",
  });

export const infoTickerInputSchema = z
  .object({
    enabled: z.boolean().default(DEFAULT_INFO_TICKER.enabled),
    text: z.string().max(TICKER_TEXT_MAX, { message: `Teks info maksimal ${TICKER_TEXT_MAX} karakter.` }).default(DEFAULT_INFO_TICKER.text),
    speed: z
      .number()
      .int("Kecepatan harus bilangan bulat.")
      .min(TICKER_SPEED_MIN, { message: `Kecepatan minimal ${TICKER_SPEED_MIN} px per detik.` })
      .max(TICKER_SPEED_MAX, { message: `Kecepatan maksimal ${TICKER_SPEED_MAX} px per detik.` })
      .default(TICKER_SPEED_DEFAULT),
    direction: z.enum(["left", "right"]).default(DEFAULT_INFO_TICKER.direction),
    pause_on_touch: z.boolean().default(DEFAULT_INFO_TICKER.pause_on_touch),
    gap: z
      .number()
      .int("Jarak harus bilangan bulat.")
      .min(TICKER_GAP_MIN, { message: `Jarak antar teks minimal ${TICKER_GAP_MIN} px.` })
      .max(TICKER_GAP_MAX, { message: `Jarak antar teks maksimal ${TICKER_GAP_MAX} px.` })
      .default(TICKER_GAP_DEFAULT),
    link_url: optionalLink.default(null),
    icon: z.enum(["megaphone", "bell", "star", "none"]).default(DEFAULT_INFO_TICKER.icon),
    style: z.enum(["default", "emas", "peringatan"]).default(DEFAULT_INFO_TICKER.style),
    start_at: optionalDate.default(null),
    end_at: optionalDate.default(null),
  })
  .refine((v) => !(v.start_at && v.end_at && Date.parse(v.start_at) > Date.parse(v.end_at)), {
    message: "Jadwal selesai harus setelah jadwal tampil.",
  });

export type InfoTickerInput = z.input<typeof infoTickerInputSchema>;

function toIso(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Hasil validasi Zod -> bentuk simpan/rendah yang dipakai komponen. */
export function normalizeInfoTicker(input: InfoTickerInput): InfoTickerSettings {
  const parsed = infoTickerInputSchema.parse(input);
  const link = String(parsed.link_url ?? "").trim();
  return {
    enabled: parsed.enabled,
    text: parsed.text.trim(),
    speed: parsed.speed,
    direction: parsed.direction,
    pause_on_touch: parsed.pause_on_touch,
    gap: parsed.gap,
    link_url: link === "" ? null : link,
    icon: parsed.icon,
    style: parsed.style,
    start_at: toIso(parsed.start_at),
    end_at: toIso(parsed.end_at),
  };
}

/** Nilai default untuk tombol "Kembalikan default" (teks tidak dihapus). */
export function infoTickerPresentationDefaults(): InfoTickerInput {
  return {
    enabled: DEFAULT_INFO_TICKER.enabled,
    speed: DEFAULT_INFO_TICKER.speed,
    direction: DEFAULT_INFO_TICKER.direction,
    pause_on_touch: DEFAULT_INFO_TICKER.pause_on_touch,
    gap: DEFAULT_INFO_TICKER.gap,
    link_url: null,
    icon: DEFAULT_INFO_TICKER.icon,
    style: DEFAULT_INFO_TICKER.style,
    start_at: null,
    end_at: null,
  };
}

/** Ticker boleh tampil sekarang? (nonaktif / di luar jadwal = false) */
export function tickerIsLive(settings: InfoTickerSettings, now: Date = new Date()): boolean {
  if (!settings.enabled) return false;
  const time = now.getTime();
  if (settings.start_at && time < Date.parse(settings.start_at)) return false;
  if (settings.end_at && time > Date.parse(settings.end_at)) return false;
  return true;
}

/** Baris info + garis pemisahnya hanya muncul kalau ada isinya. */
export function tickerShouldRender(settings: InfoTickerSettings, now: Date = new Date()): boolean {
  return settings.text.trim().length > 0 && tickerIsLive(settings, now);
}
