import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const MENU = "src/lib/admin-menu.ts";
const SIDEBAR = "src/app/admin/AdminSidebar.tsx";
const SHELL = "src/app/admin/AdminShell.tsx";
const LAYOUT = "src/app/admin/layout.tsx";
const NAVBAR = "src/components/Navbar.tsx";
const CONFIG = "next.config.js";
const FEES = "src/app/admin/fees/page.tsx";
const IMAGES = "src/app/admin/product-images/page.tsx";

test("v101 grup menu admin lengkap dan memakai permission yang sudah ada", () => {
  const menu = read(MENU);
  for (const label of ["Operasional", "Katalog", "Keuangan", "Tampilan", "Keamanan", "Sistem"]) {
    assert.match(menu, new RegExp(`label: "${label}"`));
  }
  for (const permission of [
    "dashboard.view", "orders.manage", "users.view", "support.manage",
    "products.manage", "categories.manage", "ppob.manage", "ppob.monitor",
    "topups.manage", "wallet.adjust", "payments.manage", "pricing.manage",
    "finance.view", "reconciliation.manage", "platform.manage", "promos.manage",
    "monitoring.view", "permissions.manage", "audit.view", "analytics.view",
  ]) {
    assert.match(menu, new RegExp(`permission: "${permission.replace(".", "\\.")}"`));
  }
});

test("v101 menu pengaturan hanya tampil bila halaman-nya sudah ada", () => {
  const menu = read(MENU);
  const pages = {
    "Pengaturan Beranda": "src/app/admin/pengaturan-beranda/page.tsx",
    "Tema & Branding": "src/app/admin/tema-branding/page.tsx",
    "Teks & Halaman": "src/app/admin/teks-halaman/page.tsx",
    "Level & KYC": "src/app/admin/level-kyc/page.tsx",
    "Template Notifikasi": "src/app/admin/template-notifikasi/page.tsx",
    "Pengaturan Operator": "src/app/admin/operator/page.tsx",
  };
  for (const [label, file] of Object.entries(pages)) {
    assert.ok(exists(file), `${file} harus ada`);
    assert.match(menu, new RegExp(`label: "${label}"`));
  }
});

test("v101 layout memfilter menu di server memakai admin_role_permissions", () => {
  const layout = read(LAYOUT);
  assert.match(layout, /from\("admin_role_permissions"\)/);
  assert.match(layout, /\.eq\("role", profile\.role\)/);
  assert.match(layout, /filterAdminMenu\(ADMIN_MENU, allowed\)/);
  assert.match(layout, /verifyAdmin2FAToken/);
  assert.match(layout, /<AdminShell groups=\{groups\} badges=\{badges\} adminId=\{user\.id\}>/);
});

test("v101 badge antrean memakai hitungan ringan tanpa query berat", () => {
  const layout = read(LAYOUT);
  assert.match(layout, /select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(layout, /\.eq\("status", "PROCESSING"\)/);
  assert.match(layout, /\.eq\("status", "SUBMITTED"\)/);
  assert.match(layout, /\.eq\("status", "OPEN"\)/);
  assert.match(layout, /\.eq\("status", "PENDING"\)/);
  assert.match(layout, /createAdminClient\(\)/);
  assert.match(layout, /safeCount/);
});

test("v101 sidebar: pencarian, favorit, grup lipat, state per admin di localStorage + try/catch", () => {
  const sidebar = read(SIDEBAR);
  assert.match(sidebar, /placeholder="Cari menu\.\.\."/);
  assert.match(sidebar, /Menu tidak ditemukan/);
  assert.match(sidebar, /Icon name="star_fill" size=\{12\} \/> Favorit/);
  assert.match(sidebar, /aidil_admin_favs_v1_\$\{adminId\}/);
  assert.match(sidebar, /aidil_admin_groups_v1_\$\{adminId\}/);
  assert.match(sidebar, /try \{\s*const raw = window\.localStorage\.getItem\(key\)/);
  assert.match(sidebar, /try \{\s*window\.localStorage\.setItem\(key, JSON\.stringify\(value\)\)/);
  assert.match(sidebar, /aria-expanded=\{open\}/);
  assert.match(sidebar, /aria-pressed=\{favorite\}/);
  // Grup yang berisi item aktif otomatis dibuka.
  assert.match(sidebar, /setCollapsed\(\(current\) => \{/);
});

test("v101 shell: header judul + Lihat Toko, drawer portal, bottom nav admin", () => {
  const shell = read(SHELL);
  assert.match(shell, /adminPageTitle\(pathname\)/);
  assert.match(shell, /Lihat Toko/);
  assert.match(shell, /createPortal\(/);
  assert.match(shell, /document\.body/);
  assert.match(shell, /z-\[900\]/);
  assert.match(shell, /z-\[901\]/);
  assert.match(shell, /role="dialog"/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /setDrawerOpen\(false\)/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /md:grid-cols-\[240px_1fr\]/);
  assert.match(shell, /<FloatingNav/);
  assert.match(shell, /\{ href: "\/admin", label: "Dashboard", icon: "chart_bar" \}/);
  assert.match(shell, /\{ href: "\/admin\/orders", label: "Pesanan", icon: "receipt" \}/);
  assert.match(shell, /\{ href: "\/admin\/users", label: "Pengguna", icon: "users" \}/);
  assert.match(shell, /action=\{\{ label: "Menu", icon: "menu"/);
  assert.match(shell, /ariaLabel="Navigasi admin"/);
  assert.match(shell, /md:hidden/);
});

test("v101 bottom nav toko dan header toko tidak tampil di halaman admin", () => {
  assert.match(read(NAVBAR), /pathname\.startsWith\("\/admin"\)\) return null/);
});

test("v101 gabungan halaman: Gambar & Logo Brand dan Biaya dengan redirect URL lama", () => {
  assert.ok(exists("src/app/admin/product-images/page.tsx"));
  assert.ok(exists("src/app/admin/brand-media/page.tsx"));
  assert.ok(exists(FEES));
  assert.ok(exists("src/app/admin/payment-channel-fees/page.tsx"));
  assert.ok(exists("src/app/admin/platform/page.tsx"));
  assert.ok(exists("src/app/admin/pricing/page.tsx"));

  const images = read(IMAGES);
  assert.match(images, /Gambar &amp; Logo Brand/);
  assert.match(images, /requested === "brand" \|\| requested === "brands"/);

  const fees = read(FEES);
  assert.match(fees, /type FeeTab = "channel" \| "platform" \| "harga"/);
  assert.match(fees, /"Biaya Channel"/);
  assert.match(fees, /"Platform & Biaya"/);
  assert.match(fees, /"Harga Transaksi"/);

  const config = read(CONFIG);
  assert.match(config, /source: "\/admin\/brand-media", destination: "\/admin\/product-images\?tab=brand", permanent: false/);
  assert.match(config, /source: "\/admin\/payment-channel-fees", destination: "\/admin\/fees\?tab=channel", permanent: false/);
  assert.match(config, /source: "\/admin\/platform", destination: "\/admin\/fees\?tab=platform", permanent: false/);
  assert.match(config, /source: "\/admin\/pricing", destination: "\/admin\/fees\?tab=harga", permanent: false/);
});

test("v101 helper menu: item aktif paling spesifik dan /admin hanya aktif persis", () => {
  const menu = read(MENU);
  assert.match(menu, /export function adminActiveHref/);
  assert.match(menu, /item\.href === "\/admin" \? pathname === "\/admin"/);
  assert.match(menu, /item\.href\.length > best\.length/);
  assert.match(menu, /export function filterAdminMenu/);
  assert.match(menu, /export function adminPageTitle/);
});
