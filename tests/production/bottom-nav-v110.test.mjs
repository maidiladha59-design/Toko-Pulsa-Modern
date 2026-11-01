import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const MIGRATION = "supabase/migrations_v110_bottom_nav.sql";
const PREFLIGHT = "scripts/migration-preflight.mjs";
const LIB = "src/lib/bottom-nav.ts";
const REGISTRY = "src/lib/managed-settings.ts";
const SITE = "src/lib/site-settings.ts";
const COMPONENT = "src/components/BottomNav.tsx";
const CSS = "src/app/globals.css";
const NAVBAR = "src/components/Navbar.tsx";
const SHELL = "src/app/admin/AdminShell.tsx";
const ROOT_LAYOUT = "src/app/layout.tsx";
const ADMIN_LAYOUT = "src/app/admin/layout.tsx";
const ADMIN_PAGE = "src/app/admin/navigasi-bawah/page.tsx";
const ADMIN_EDITOR = "src/app/admin/navigasi-bawah/BottomNavSettingsEditor.tsx";
const MENU = "src/lib/admin-menu.ts";

test("v110 migrasi: policy baca publik diperluas + seed dua kunci, tanpa sentuh transaksi", () => {
  assert.ok(exists(MIGRATION), "file migrasi v110 harus ada");
  const sql = read(MIGRATION);

  assert.match(sql, /drop policy if exists "site_settings_public_read" on public\.site_settings;/);
  assert.match(sql, /create policy "site_settings_public_read"/);
  for (const key of [
    "info_ticker",
    "home_settings",
    "theme_settings",
    "pages_settings",
    "level_kyc_settings",
    "operator_settings",
    "bottom_nav_shop",
    "bottom_nav_admin",
  ]) {
    assert.match(sql, new RegExp(`'${key}'`), `policy harus memuat ${key}`);
  }

  assert.match(sql, /values\s+\('bottom_nav_shop', '\{\}'::jsonb\),\s+\('bottom_nav_admin', '\{\}'::jsonb\)/);
  assert.match(sql, /on conflict \(key\) do nothing;/);

  // Tidak ada perubahan pada tabel transaksi/saldo dan tidak ada tabel baru.
  assert.doesNotMatch(
    sql,
    /(insert into|update|alter table|create table)\s+public\.(wallets|orders|topups|transactions|financial_ledger)/i
  );
});

test("v110 preflight mengenal migrasi dan urutan wajib berakhir di 110", () => {
  const script = read(PREFLIGHT);
  assert.match(script, /migrations_v110_bottom_nav\.sql/);
  assert.match(script, /'bottom_nav_shop'/);
  assert.match(script, /'bottom_nav_admin'/);
  assert.match(script, /100,105,106,107,108,109,110\]/);
});

test("v110 lib: tujuh varian, batas item, target internal, normalisasi aman", () => {
  const lib = read(LIB);
  assert.match(lib, /export const BOTTOM_NAV_SHOP_KEY = "bottom_nav_shop";/);
  assert.match(lib, /export const BOTTOM_NAV_ADMIN_KEY = "bottom_nav_admin";/);
  assert.match(lib, /export const BOTTOM_NAV_MENU_TARGET = "menu";/);
  for (const variant of ["kapsul", "kotak", "garis", "pil", "tengah", "kaca", "ikon"]) {
    assert.match(lib, new RegExp(`"${variant}"`), `varian ${variant} harus ada`);
  }
  assert.match(lib, /export const BOTTOM_NAV_VARIANTS = \[/);
  assert.match(lib, /export const BOTTOM_NAV_HEIGHTS = \["ringkas", "normal", "besar"\] as const;/);
  assert.match(lib, /export const BOTTOM_NAV_RADII = \["kecil", "sedang", "besar"\] as const;/);
  assert.match(lib, /export const BOTTOM_NAV_ACTIVE_EFFECTS = \["slide", "none"\] as const;/);
  assert.match(lib, /export const BOTTOM_NAV_ACCENTS = \["tema", "biru", "mint", "emas", "ungu"\] as const;/);

  // Skema: 3–5 item, label 12 karakter, ikon registry, target dari daftar internal.
  assert.match(lib, /\.min\(3, "Minimal 3 item menu\."\)/);
  assert.match(lib, /\.max\(5, "Maksimal 5 item menu\."\)/);
  assert.match(lib, /\.max\(12, "Label item maksimal 12 karakter\."\)/);
  assert.match(lib, /refine\(isIconName/);
  assert.match(lib, /targets\.includes\(value\)/);
  assert.match(lib, /"Tujuan menu tidak diizinkan\."/);
  assert.match(lib, /Item pertama harus Beranda\./);
  assert.match(lib, /Item pertama harus Dashboard\./);
  assert.match(lib, /Tujuan menu tidak boleh kembar\./);
  assert.match(lib, /Hanya satu item yang boleh menjadi tombol tengah\./);

  // Normalisasi: ikon tanpa label, tengah tanpa tombol tengah jatuh ke kapsul,
  // dan item yang semuanya tersembunyi kembali ke default.
  assert.match(lib, /if \(!items\.some\(\(item\) => item\.visible\)\) return bottomNavScopeDefaults\(scope\);/);
  assert.match(lib, /variant = "kapsul";/);
  assert.match(lib, /show_labels: variant === "ikon" \? false : parsed\.show_labels/);

  // Default = kapsul dengan menu yang sekarang.
  assert.match(lib, /variant: "kapsul",/);
  assert.match(lib, /label: "Beranda", icon: "home"/);
  assert.match(lib, /label: "Layanan", icon: "grid"/);
  assert.match(lib, /label: "Saldo", icon: "wallet"/);
  assert.match(lib, /label: "Transaksi", icon: "receipt"/);
  assert.match(lib, /label: "Lainnya", icon: "menu"/);
  assert.match(lib, /label: "Dashboard", icon: "chart_bar"/);
  assert.match(lib, /label: "Pesanan", icon: "receipt"/);
  assert.match(lib, /label: "Pengguna", icon: "users"/);

  // Sub-halaman menandai induknya; beranda hanya aktif persis.
  assert.match(lib, /if \(target === "\/" \|\| target === "\/admin"\) return pathname === target;/);
  assert.match(lib, /pathname\.startsWith\("\/ppob"\)/);
  assert.match(lib, /export function visibleBottomNavItems/);
  assert.match(lib, /export function bottomNavEffectiveVariant/);
});

test("v110 registry: dua kunci, izin platform.manage, baca publik, tag situs", () => {
  const reg = read(REGISTRY);
  assert.match(reg, /bottom_nav_shop: \{/);
  assert.match(reg, /bottom_nav_admin: \{/);
  assert.match(reg, /key: BOTTOM_NAV_SHOP_KEY/);
  assert.match(reg, /key: BOTTOM_NAV_ADMIN_KEY/);
  assert.match(reg, /schema: bottomNavShopInputSchema/);
  assert.match(reg, /schema: bottomNavAdminInputSchema/);
  assert.match(reg, /normalize: normalizeBottomNavShop/);
  assert.match(reg, /normalize: normalizeBottomNavAdmin/);
  assert.match(reg, /label: "Navigasi Bawah Toko"/);
  assert.match(reg, /label: "Navigasi Bawah Admin"/);
  assert.match(reg, /extraTags: \[SITE_SETTINGS_TAG\]/);
  assert.match(reg, /permission: "platform\.manage"/);
  assert.match(reg, /publicRead: true/);

  const site = read(SITE);
  assert.match(site, /export async function getBottomNav\(scope: BottomNavScope\)/);
  assert.match(site, /getSetting<BottomNavSettings>\(BOTTOM_NAV_ADMIN_KEY, DEFAULT_BOTTOM_NAV_ADMIN\)/);
  assert.match(site, /getSetting<BottomNavSettings>\(BOTTOM_NAV_SHOP_KEY, DEFAULT_BOTTOM_NAV_SHOP\)/);
});

test("v110 komponen: satu BottomNav 7 varian, aksesibilitas, keyboard, getaran", () => {
  assert.match(read(COMPONENT), /data-variant=\{variant\}/);
  assert.match(read(COMPONENT), /data-hidden=\{!embedded && \(hidden \|\| keyboardOpen\)/);
  assert.match(read(COMPONENT), /BOTTOM_NAV_MENU_TARGET/);
  assert.match(read(COMPONENT), /navigator\.vibrate\?\.\(8\)/);
  assert.match(read(COMPONENT), /visualViewport/);
  assert.match(read(COMPONENT), /bottom-nav-slider/);
  assert.match(read(COMPONENT), /aria-current=\{active \? "page" : undefined\}/);
  assert.match(read(COMPONENT), /embedded/);
  assert.match(read(COMPONENT), /env\(safe-area-inset-bottom\)/);

  const css = read(CSS);
  assert.match(css, /\.bottom-nav \{/);
  // "kapsul" adalah gaya dasar elemen .bottom-nav; enam varian lain punya selector sendiri.
  for (const variant of ["kotak", "garis", "pil", "tengah", "kaca", "ikon"]) {
    assert.match(css, new RegExp(`data-variant="${variant}"`), `gaya ${variant} harus ada di CSS`);
  }
  assert.match(css, /\.bottom-nav-slider-thumb/);
  assert.match(css, /backdrop-filter: blur\(24px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /\.bottom-nav\[data-embedded="true"\]/);
  assert.match(css, /\.bottom-nav:not\(\[data-embedded="true"\]\) \{ display: none; \}/);
});

test("v110 wiring: toko & admin membaca pengaturan server, item login-only & izin dihormati", () => {
  const layout = read(ROOT_LAYOUT);
  assert.match(layout, /import \{ getBottomNav \} from "@\/lib\/site-settings";/);
  assert.match(layout, /getBottomNav\("shop"\)/);
  assert.match(layout, /navSettings=\{navSettings\}/);

  const navbar = read(NAVBAR);
  assert.match(navbar, /import BottomNav from "\.\/BottomNav";/);
  assert.match(navbar, /navSettings: BottomNavSettings/);
  assert.match(navbar, /visibleBottomNavItems\(navSettings, \{ loggedIn: Boolean\(profile\) \}\)/);
  assert.match(navbar, /<BottomNav/);
  assert.match(navbar, /menuOpen=\{menuOpen\}/);
  assert.match(navbar, /onMenu=\{\(\) => setMenuOpen\(\(v\) => !v\)\}/);
  assert.match(navbar, /pathname\.startsWith\("\/checkout"\)/);
  assert.match(navbar, /pathname\.startsWith\("\/admin"\)\) return null/);
  assert.doesNotMatch(navbar, /FloatingNav/);
  assert.ok(!exists("src/components/FloatingNav.tsx"), "komponen lama harus sudah dihapus");

  const adminLayout = read(ADMIN_LAYOUT);
  assert.match(adminLayout, /import \{ getBottomNav \} from "@\/lib\/site-settings";/);
  assert.match(adminLayout, /getBottomNav\("admin"\)/);
  assert.match(adminLayout, /navSettings=\{navSettings\}/);

  const shell = read(SHELL);
  assert.match(shell, /navSettings: BottomNavSettings/);
  assert.match(shell, /allowedHrefs\.has\(item\.target\)/);
  assert.match(shell, /item\.target === BOTTOM_NAV_MENU_TARGET/);
  assert.match(shell, /<BottomNav/);
  assert.match(shell, /onMenu=\{\(\) => setDrawerOpen\(true\)\}/);
  assert.match(shell, /"\/admin\/orders": badges\.orders/);
  assert.match(shell, /"\/admin\/users": badges\.kyc/);
  assert.doesNotMatch(shell, /FloatingNav/);
});

test("v110 halaman admin: SettingsForm dua lingkup, galeri 7 varian, pratinjau 360 terang+gelap", () => {
  assert.ok(exists(ADMIN_PAGE));
  const page = read(ADMIN_PAGE);
  assert.match(page, /getSetting\(THEME_SETTINGS_KEY, DEFAULT_THEME_SETTINGS\)/);
  assert.match(page, /<BottomNavSettingsEditor theme=\{theme\} \/>/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);

  const editor = read(ADMIN_EDITOR);
  assert.match(editor, /"use client";/);
  assert.match(editor, /<SettingsForm<BottomNavSettings>/);
  assert.match(editor, /settingKey=\{BOTTOM_NAV_SHOP_KEY\}/);
  assert.match(editor, /settingKey=\{BOTTOM_NAV_ADMIN_KEY\}/);
  assert.match(editor, /validate=\{validateShop\}/);
  assert.match(editor, /validate=\{validateAdmin\}/);
  assert.match(editor, /bottomNavValidate\(value, scope\)/);
  assert.match(editor, /BOTTOM_NAV_VARIANT_OPTIONS\.map/);
  assert.match(editor, /<BottomNav/);
  assert.match(editor, /embedded/);
  assert.match(editor, /themePreviewStyle\(theme\[mode\], theme\)/);
  assert.match(editor, /mode="light"/);
  assert.match(editor, /mode="dark"/);
  assert.match(editor, /w-\[360px\]/);
  assert.match(editor, /min-h-\[430px\]/);
  assert.match(editor, /<IconPicker/);
  assert.match(editor, /Terpilih/);
  assert.match(editor, /Default/);
  assert.match(editor, /Putar animasi/);
  assert.match(editor, /bottomNavHomeTarget\(scope\)/);
  assert.match(editor, /disabled=\{locked \|\| items\.length <= 3\}/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);

  const menu = read(MENU);
  assert.match(
    menu,
    /href: "\/admin\/navigasi-bawah", icon: "sliders", label: "Navigasi Bawah", permission: "platform\.manage"/
  );
});

test("v110 tidak menyentuh pembayaran, saldo, PIN, webhook, dan API transaksi", () => {
  const untouched = [
    "src/app/api/topup/route.ts",
    "src/app/api/midtrans/webhook/route.ts",
    "src/app/api/orders/route.ts",
    "src/app/api/wallet/route.ts",
    "src/lib/midtrans.ts",
  ];
  for (const file of untouched) {
    if (!exists(file)) continue;
    assert.doesNotMatch(read(file), /bottom_nav|BottomNav/);
  }
  for (const file of [LIB, COMPONENT, NAVBAR, SHELL, ADMIN_PAGE, ADMIN_EDITOR, ROOT_LAYOUT, ADMIN_LAYOUT]) {
    assert.doesNotMatch(read(file), /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'`]/, "tidak ada kunci rahasia hardcoded");
    assert.doesNotMatch(read(file), /MIDTRANS_(SERVER|CLIENT)_KEY\s*=\s*["'`]/);
  }
});
