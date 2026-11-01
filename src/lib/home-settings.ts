import { z } from "zod";
import {
  DEFAULT_HOME_SERVICES,
  SERVICE_TAB_KEYS,
  type HomeServiceItem,
  type ServiceTabKey,
} from "@/config/service-categories";
import { isIconName } from "@/components/icons/registry";
import {
  assetUrlSchema,
  isInternalPathOrHttps,
  optionalInternalPathOrHttpsSchema,
  plainTextSchema,
} from "@/lib/setting-primitives";

// Pengaturan beranda (site_settings.home_settings, migrasi v106).
// File ini murni: tidak menyentuh database, cache, atau pembayaran.

export const HOME_SETTINGS_KEY = "home_settings";

export const HOME_SECTION_IDS = [
  "hero",
  "rating",
  "banner",
  "ranking",
  "scan",
  "services",
  "products",
  "missions",
  "testimonials",
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
  hero: "Hero (sapaan + menu cepat)",
  rating: "Badge rating pelanggan",
  banner: "Banner / slider",
  ranking: "Peringkat pelanggan",
  scan: "Pintasan Scan QRIS",
  services: "Layanan",
  products: "Produk pilihan",
  missions: "Misi bonus saldo",
  testimonials: "Cerita pelanggan",
};

export type HomeBanner = {
  id: string;
  imageUrl: string;
  alt: string;
  href: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export type HomeSection = { id: HomeSectionId; visible: boolean };

export type HomeSettings = {
  hero: {
    title: string;
    highlight: string;
    description: string;
    showBalance: boolean;
    showLevel: boolean;
    showAccountId: boolean;
  };
  banners: HomeBanner[];
  services: { items: HomeServiceItem[] };
  sections: HomeSection[];
};

const DEFAULT_SECTIONS: HomeSection[] = HOME_SECTION_IDS.map((id) => ({ id, visible: true }));

const DEFAULT_HERO: HomeSettings["hero"] = {
  title: "Semua transaksi digital, lebih praktis.",
  highlight: "lebih praktis.",
  description:
    "Pulsa, data, game, e-wallet, tagihan, voucher dan layanan digital lainnya dalam satu akun.",
  showBalance: true,
  showLevel: true,
  showAccountId: true,
};

export const DEFAULT_HOME_SETTINGS: HomeSettings = {
  hero: DEFAULT_HERO,
  banners: [],
  services: { items: DEFAULT_HOME_SERVICES },
  sections: DEFAULT_SECTIONS,
};

const scheduleSchema = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), {
    message: "Jadwal harus berupa tanggal dan jam yang valid.",
  });

const bannerSchema = z.object({
  id: z
    .string()
    .trim()
    .min(6, "ID banner tidak valid.")
    .max(64, "ID banner terlalu panjang.")
    .regex(/^[a-zA-Z0-9_-]+$/, "ID banner tidak valid."),
  imageUrl: assetUrlSchema,
  alt: plainTextSchema(160),
  href: optionalInternalPathOrHttpsSchema,
  isActive: z.boolean(),
  startsAt: scheduleSchema.nullable(),
  endsAt: scheduleSchema.nullable(),
});

const serviceItemSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2, "ID layanan tidak valid.")
    .max(40, "ID layanan terlalu panjang.")
    .regex(/^[a-z0-9_-]+$/, "ID layanan tidak valid."),
  label: z.string().trim().min(1, "Nama layanan wajib diisi.").max(40, "Nama layanan maksimal 40 karakter."),
  slug: z
    .string()
    .trim()
    .min(2, "Slug tidak valid.")
    .max(60, "Slug terlalu panjang.")
    .regex(/^[a-z0-9-]+$/, "Slug hanya huruf kecil, angka, dan tanda hubung."),
  icon: z.string().trim().refine(isIconName, { message: "Ikon tidak dikenal." }),
  tab: z.enum(SERVICE_TAB_KEYS),
  visible: z.boolean(),
});

const heroSchema = z.object({
  title: z.string().trim().min(1, "Judul hero wajib diisi.").max(120, "Judul hero maksimal 120 karakter."),
  highlight: plainTextSchema(60),
  description: plainTextSchema(240),
  showBalance: z.boolean(),
  showLevel: z.boolean(),
  showAccountId: z.boolean(),
});

const sectionSchema = z.object({
  id: z.enum(HOME_SECTION_IDS),
  visible: z.boolean(),
});

export const homeSettingsInputSchema = z.object({
  hero: heroSchema.default(DEFAULT_HERO),
  banners: z.array(bannerSchema).max(20, "Maksimal 20 banner.").default([]),
  services: z
    .object({
      items: z.array(serviceItemSchema).max(40, "Maksimal 40 layanan.").default(DEFAULT_HOME_SERVICES),
    })
    .default({ items: DEFAULT_HOME_SERVICES }),
  sections: z.array(sectionSchema).max(HOME_SECTION_IDS.length).default(DEFAULT_SECTIONS),
});

function scheduleValueToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** ISO -> nilai input datetime-local (waktu lokal browser). */
export function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Nilai input datetime-local -> ISO, atau null bila kosong/tidak valid. */
export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function normalizeHomeSettings(value: z.infer<typeof homeSettingsInputSchema>): HomeSettings {
  const seenSections = new Set<HomeSectionId>();
  const sections: HomeSection[] = [];
  for (const section of value.sections) {
    if (seenSections.has(section.id)) continue;
    seenSections.add(section.id);
    sections.push({ id: section.id, visible: section.visible });
  }
  for (const id of HOME_SECTION_IDS) {
    if (!seenSections.has(id)) sections.push({ id, visible: true });
  }

  return {
    hero: {
      title: value.hero.title.trim(),
      highlight: value.hero.highlight.trim(),
      description: value.hero.description.trim(),
      showBalance: value.hero.showBalance,
      showLevel: value.hero.showLevel,
      showAccountId: value.hero.showAccountId,
    },
    banners: value.banners.map((banner) => ({
      id: banner.id,
      imageUrl: banner.imageUrl.trim(),
      alt: banner.alt.trim(),
      href: banner.href.trim(),
      isActive: banner.isActive,
      startsAt: scheduleValueToIso(banner.startsAt),
      endsAt: scheduleValueToIso(banner.endsAt),
    })),
    services: {
      items: value.services.items.map((item) => ({
        id: item.id,
        label: item.label.trim(),
        slug: item.slug.trim(),
        icon: item.icon,
        tab: item.tab as ServiceTabKey,
        visible: item.visible,
      })),
    },
    sections,
  };
}

/** Banner yang benar-benar tampil sekarang: aktif, punya gambar, dan di dalam jadwal. */
export function visibleHomeBanners(settings: HomeSettings, now: number = Date.now()): HomeBanner[] {
  return settings.banners.filter((banner) => {
    if (!banner.isActive || !banner.imageUrl) return false;
    if (banner.startsAt) {
      const start = Date.parse(banner.startsAt);
      if (!Number.isNaN(start) && now < start) return false;
    }
    if (banner.endsAt) {
      const end = Date.parse(banner.endsAt);
      if (!Number.isNaN(end) && now > end) return false;
    }
    return true;
  });
}

export function visibleHomeServices(settings: HomeSettings): HomeServiceItem[] {
  return settings.services.items.filter((item) => item.visible);
}

/** Urutan bagian beranda yang boleh dirender (visible=true), sesuai urutan admin. */
export function orderedHomeSections(settings: HomeSettings): HomeSectionId[] {
  return settings.sections.filter((section) => section.visible).map((section) => section.id);
}

/**
 * Validasi draf dari panel admin. Diletakkan di lib (bukan di file page)
 * karena Next menolak ekspor tambahan selain default/metadata dari page.
 */
export function homeValidate(value: HomeSettings): string | null {
  if (!value.hero.title.trim()) return "Judul hero wajib diisi.";
  if (value.hero.title.length > 120) return "Judul hero maksimal 120 karakter.";
  if (value.hero.highlight.length > 60) return "Sorotan judul maksimal 60 karakter.";
  if (value.hero.description.length > 240) return "Kalimat penjelas maksimal 240 karakter.";

  if (value.banners.length > 20) return "Maksimal 20 banner.";
  for (let i = 0; i < value.banners.length; i += 1) {
    const banner = value.banners[i];
    if (banner.alt.length > 160) return `Teks alternatif banner ${i + 1} maksimal 160 karakter.`;
    if (banner.href && !isInternalPathOrHttps(banner.href)) {
      return `Link banner ${i + 1} hanya boleh path internal (diawali /) atau https.`;
    }
  }

  for (const item of value.services.items) {
    if (!item.label.trim()) return "Nama layanan wajib diisi.";
    if (item.label.length > 40) return "Nama layanan maksimal 40 karakter.";
    if (!/^[a-z0-9-]+$/.test(item.slug)) return "Slug layanan hanya huruf kecil, angka, dan tanda hubung.";
  }

  if (value.sections.length !== HOME_SECTION_IDS.length) {
    return "Daftar urutan bagian beranda tidak lengkap. Muat ulang halaman lalu coba lagi.";
  }
  return null;
}

/**
 * Pemeriksaan tambahan khusus saat Terbitkan (bukan saat simpan draf).
 * Server memanggil ini juga supaya banner tanpa gambar tidak pernah tayang.
 */
export function homePublishError(settings: HomeSettings): string | null {
  const activeWithoutImage = settings.banners.find((banner) => banner.isActive && !banner.imageUrl);
  if (activeWithoutImage) {
    return "Masih ada banner aktif tanpa gambar. Unggah gambarnya atau nonaktifkan banner tersebut sebelum menerbitkan.";
  }

  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const item of settings.services.items) {
    if (ids.has(item.id)) return `ID layanan "${item.id}" dipakai lebih dari satu kali.`;
    if (slugs.has(item.slug)) return `Slug layanan "${item.slug}" dipakai lebih dari satu kali.`;
    ids.add(item.id);
    slugs.add(item.slug);
  }

  if (settings.sections.length !== HOME_SECTION_IDS.length) {
    return "Daftar urutan bagian beranda tidak lengkap. Muat ulang halaman lalu coba lagi.";
  }

  return null;
}

/** Label ikut tab; dipakai pratinjau dan halaman beranda. */
export function serviceTabText(tab: ServiceTabKey): string {
  switch (tab) {
    case "isi-ulang":
      return "Isi Ulang";
    case "tagihan":
      return "Bayar Tagihan";
    case "hiburan":
      return "Hiburan";
    default:
      return "Produk Digital";
  }
}
