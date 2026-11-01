import { z } from "zod";
import { isIconName } from "@/components/icons/registry";
import { ADMIN_MENU, flattenAdminMenu } from "@/lib/admin-menu";

// Pengaturan Navigasi Bawah (site_settings.bottom_nav_shop / bottom_nav_admin,
// migrasi v110). File ini murni: tanpa database, cache, atau React.

export const BOTTOM_NAV_SHOP_KEY = "bottom_nav_shop";
export const BOTTOM_NAV_ADMIN_KEY = "bottom_nav_admin";

export type BottomNavScope = "shop" | "admin";

export const BOTTOM_NAV_VARIANTS = [
  "kapsul",
  "kotak",
  "garis",
  "pil",
  "tengah",
  "kaca",
  "ikon",
] as const;

export type BottomNavVariant = (typeof BOTTOM_NAV_VARIANTS)[number];

export const BOTTOM_NAV_VARIANT_OPTIONS: ReadonlyArray<{
  key: BottomNavVariant;
  label: string;
  description: string;
}> = [
  { key: "kapsul", label: "Kapsul", description: "Kapsul melayang bulat dengan label. Gaya bawaan." },
  { key: "kotak", label: "Kotak", description: "Bar kotak selebar layar menempel di bawah, garis tipis di atas." },
  { key: "garis", label: "Garis", description: "Bar penuh dengan garis indikator tebal di atas item aktif." },
  { key: "pil", label: "Pil", description: "Item aktif memanjang jadi pil berisi ikon dan label." },
  { key: "tengah", label: "Tengah", description: "Tombol bulat besar menonjol di tengah dengan lengkungan di belakangnya." },
  { key: "kaca", label: "Kaca", description: "Kapsul efek kaca dengan blur kuat, fallback solid bila tidak didukung." },
  { key: "ikon", label: "Ikon", description: "Kapsul tipis tanpa label; titik kecil menandai item aktif." },
];

export const BOTTOM_NAV_HEIGHTS = ["ringkas", "normal", "besar"] as const;
export type BottomNavHeight = (typeof BOTTOM_NAV_HEIGHTS)[number];

export const BOTTOM_NAV_RADII = ["kecil", "sedang", "besar"] as const;
export type BottomNavRadius = (typeof BOTTOM_NAV_RADII)[number];

export const BOTTOM_NAV_ACTIVE_EFFECTS = ["slide", "none"] as const;
export type BottomNavActiveEffect = (typeof BOTTOM_NAV_ACTIVE_EFFECTS)[number];

export const BOTTOM_NAV_ACCENTS = ["tema", "biru", "mint", "emas", "ungu"] as const;
export type BottomNavAccent = (typeof BOTTOM_NAV_ACCENTS)[number];

export const BOTTOM_NAV_ACCENT_OPTIONS: ReadonlyArray<{ key: BottomNavAccent; label: string }> = [
  { key: "tema", label: "Ikut tema" },
  { key: "biru", label: "Biru" },
  { key: "mint", label: "Mint" },
  { key: "emas", label: "Emas" },
  { key: "ungu", label: "Ungu" },
];

export const BOTTOM_NAV_MENU_TARGET = "menu";

export type BottomNavItem = {
  id: string;
  label: string;
  icon: string;
  /** Path internal yang terdaftar, atau "menu" untuk membuka menu lengkap. */
  target: string;
  visible: boolean;
  login_only: boolean;
  center: boolean;
};

export type BottomNavSettings = {
  variant: BottomNavVariant;
  show_labels: boolean;
  radius: BottomNavRadius;
  height: BottomNavHeight;
  active_effect: BottomNavActiveEffect;
  animate: boolean;
  haptic: boolean;
  accent: BottomNavAccent;
  items: BottomNavItem[];
};

export type BottomNavTargetOption = { value: string; label: string };

const SHOP_TARGET_OPTIONS: BottomNavTargetOption[] = [
  { value: "/", label: "Beranda" },
  { value: "/layanan", label: "Layanan" },
  { value: "/wallet", label: "Saldo & Top Up" },
  { value: "/transactions", label: "Transaksi" },
  { value: "/orders", label: "Pesanan Saya" },
  { value: "/dashboard", label: "Dashboard" },
  { value: "/profile", label: "Profil Saya" },
  { value: "/bantuan", label: "Bantuan" },
  { value: "/diskusi", label: "Ruang Diskusi" },
  { value: "/scan-qris", label: "Scan QRIS" },
  { value: "/referral", label: "Undang Teman" },
  { value: "/missions", label: "Misi & Hadiah" },
  { value: "/kyc", label: "Verifikasi Akun" },
  { value: "/settings", label: "Pengaturan" },
  { value: BOTTOM_NAV_MENU_TARGET, label: "Menu lainnya (buka menu)" },
];

const ADMIN_TARGET_OPTIONS: BottomNavTargetOption[] = [
  ...flattenAdminMenu(ADMIN_MENU).map((item) => ({ value: item.href, label: item.label })),
  { value: BOTTOM_NAV_MENU_TARGET, label: "Menu admin (buka drawer)" },
];

export function bottomNavScopeDefaults(scope: BottomNavScope): BottomNavSettings {
  const menuItem: BottomNavItem =
    scope === "admin"
      ? { id: "menu-admin", label: "Menu", icon: "menu", target: BOTTOM_NAV_MENU_TARGET, visible: true, login_only: false, center: false }
      : { id: "lainnya", label: "Lainnya", icon: "menu", target: BOTTOM_NAV_MENU_TARGET, visible: true, login_only: false, center: false };

  return {
    variant: "kapsul",
    show_labels: true,
    radius: "besar",
    height: "normal",
    active_effect: "slide",
    animate: true,
    haptic: false,
    accent: "tema",
    items:
      scope === "admin"
        ? [
            { id: "dashboard", label: "Dashboard", icon: "chart_bar", target: "/admin", visible: true, login_only: true, center: false },
            { id: "pesanan", label: "Pesanan", icon: "receipt", target: "/admin/orders", visible: true, login_only: true, center: false },
            { id: "pengguna", label: "Pengguna", icon: "users", target: "/admin/users", visible: true, login_only: true, center: false },
            menuItem,
          ]
        : [
            { id: "beranda", label: "Beranda", icon: "home", target: "/", visible: true, login_only: false, center: false },
            { id: "layanan", label: "Layanan", icon: "grid", target: "/layanan", visible: true, login_only: false, center: false },
            { id: "saldo", label: "Saldo", icon: "wallet", target: "/wallet", visible: true, login_only: false, center: false },
            { id: "transaksi", label: "Transaksi", icon: "receipt", target: "/transactions", visible: true, login_only: false, center: false },
            menuItem,
          ],
  };
}

export const DEFAULT_BOTTOM_NAV_SHOP = bottomNavScopeDefaults("shop");
export const DEFAULT_BOTTOM_NAV_ADMIN = bottomNavScopeDefaults("admin");

export function bottomNavHomeTarget(scope: BottomNavScope): string {
  return scope === "admin" ? "/admin" : "/";
}

export function bottomNavTargetOptions(scope: BottomNavScope): BottomNavTargetOption[] {
  return scope === "admin" ? ADMIN_TARGET_OPTIONS : SHOP_TARGET_OPTIONS;
}

export function bottomNavTargets(scope: BottomNavScope): string[] {
  return bottomNavTargetOptions(scope).map((option) => option.value);
}

/** Label tujuan untuk konfirmasi di editor item. */
export function bottomNavTargetLabel(scope: BottomNavScope, target: string): string {
  return bottomNavTargetOptions(scope).find((option) => option.value === target)?.label || target;
}

const itemIdSchema = z
  .string()
  .trim()
  .min(2, "ID item tidak valid.")
  .max(32, "ID item terlalu panjang.")
  .regex(/^[a-z0-9_-]+$/, "ID item tidak valid.");

export function bottomNavItemSchema(scope: BottomNavScope) {
  const targets = bottomNavTargets(scope);
  return z.object({
    id: itemIdSchema,
    label: z
      .string()
      .trim()
      .min(1, "Label item wajib diisi.")
      .max(12, "Label item maksimal 12 karakter."),
    icon: z.string().trim().refine(isIconName, { message: "Ikon tidak dikenal." }),
    target: z
      .string()
      .trim()
      .refine((value) => targets.includes(value), { message: "Tujuan menu tidak diizinkan." }),
    visible: z.boolean(),
    login_only: z.boolean(),
    center: z.boolean(),
  });
}

export function bottomNavSettingsSchema(scope: BottomNavScope) {
  const home = bottomNavHomeTarget(scope);
  return z
    .object({
      variant: z.enum(BOTTOM_NAV_VARIANTS, {
        errorMap: () => ({ message: "Gaya navigasi tidak dikenal." }),
      }),
      show_labels: z.boolean(),
      radius: z.enum(BOTTOM_NAV_RADII),
      height: z.enum(BOTTOM_NAV_HEIGHTS),
      active_effect: z.enum(BOTTOM_NAV_ACTIVE_EFFECTS),
      animate: z.boolean(),
      haptic: z.boolean(),
      accent: z.enum(BOTTOM_NAV_ACCENTS),
      items: z
        .array(bottomNavItemSchema(scope))
        .min(3, "Minimal 3 item menu.")
        .max(5, "Maksimal 5 item menu.")
        .superRefine((items, ctx) => {
          if (items[0]?.target !== home) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: scope === "admin" ? "Item pertama harus Dashboard." : "Item pertama harus Beranda.",
            });
          }
          const ids = new Set<string>();
          const targets = new Set<string>();
          for (const item of items) {
            if (ids.has(item.id)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ID item tidak boleh kembar." });
            }
            ids.add(item.id);
            if (targets.has(item.target)) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tujuan menu tidak boleh kembar." });
            }
            targets.add(item.target);
          }
          if (!items.some((item) => item.center)) return;
          if (items.filter((item) => item.center).length > 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Hanya satu item yang boleh menjadi tombol tengah.",
            });
          }
        }),
    })
    .strict();
}

export const bottomNavShopInputSchema = bottomNavSettingsSchema("shop");
export const bottomNavAdminInputSchema = bottomNavSettingsSchema("admin");

export type BottomNavInput = z.infer<typeof bottomNavShopInputSchema>;

/**
 * Normalisasi nilai tervalidasi. Aturan yang tidak boleh membuat nav rusak:
 *  - varian "ikon" selalu tanpa label;
 *  - varian "tengah" tanpa item tengah yang tampil jatuh ke "kapsul";
 *  - bila tidak ada item yang tampil, pakai default scope.
 */
export function normalizeBottomNav(input: unknown, scope: BottomNavScope): BottomNavSettings {
  const parsed = bottomNavSettingsSchema(scope).parse(input);
  const items: BottomNavItem[] = parsed.items.map((item) => ({ ...item }));
  if (!items.some((item) => item.visible)) return bottomNavScopeDefaults(scope);

  let variant = parsed.variant;
  if (variant === "tengah") {
    const center = items.find((item) => item.center && item.visible);
    if (center) {
      for (const item of items) item.center = item.id === center.id;
    } else {
      variant = "kapsul";
      for (const item of items) item.center = false;
    }
  } else {
    for (const item of items) item.center = false;
  }

  return {
    ...parsed,
    variant,
    show_labels: variant === "ikon" ? false : parsed.show_labels,
    items,
  };
}

export const normalizeBottomNavShop = (value: unknown): BottomNavSettings =>
  normalizeBottomNav(value, "shop");
export const normalizeBottomNavAdmin = (value: unknown): BottomNavSettings =>
  normalizeBottomNav(value, "admin");

/** Pesan pertama dari validasi; null bila lolos. Server memakai skema yang sama. */
export function bottomNavValidate(value: unknown, scope: BottomNavScope): string | null {
  const parsed = bottomNavSettingsSchema(scope).safeParse(value);
  return parsed.success ? null : parsed.error.issues[0]?.message || "Pengaturan navigasi tidak valid.";
}

/** Varian efektif untuk dirender (tengah tanpa tombol tengah = kapsul). */
export function bottomNavEffectiveVariant(settings: BottomNavSettings): BottomNavVariant {
  if (settings.variant === "tengah" && !settings.items.some((item) => item.center && item.visible)) {
    return "kapsul";
  }
  return settings.variant;
}

export function visibleBottomNavItems(
  settings: BottomNavSettings,
  options: { loggedIn?: boolean } = {}
): BottomNavItem[] {
  return settings.items.filter(
    (item) => item.visible && (!item.login_only || options.loggedIn !== false)
  );
}

/** Sub-halaman ikut menandai induknya; "/" dan "/admin" hanya aktif persis. */
export function isBottomNavTargetActive(target: string, pathname: string): boolean {
  if (!target || target === BOTTOM_NAV_MENU_TARGET) return false;
  if (target === "/" || target === "/admin") return pathname === target;
  if (target === "/layanan") {
    return pathname === "/layanan" || pathname.startsWith("/layanan/") || pathname.startsWith("/ppob");
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function bottomNavTargetForPath(targets: string[], pathname: string): string | null {
  let best: string | null = null;
  for (const target of targets) {
    if (target === BOTTOM_NAV_MENU_TARGET) continue;
    if (isBottomNavTargetActive(target, pathname) && (!best || target.length > best.length)) {
      best = target;
    }
  }
  return best;
}
