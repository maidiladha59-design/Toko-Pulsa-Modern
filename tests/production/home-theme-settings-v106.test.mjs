import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const MIGRATION = "supabase/migrations_v106_home_theme_settings.sql";
const HOME_LIB = "src/lib/home-settings.ts";
const THEME_LIB = "src/lib/theme-settings.ts";
const REGISTRY = "src/lib/managed-settings.ts";
const ASSETS = "src/lib/settings-assets.ts";
const ASSET_CLIENT = "src/lib/settings-asset-client.ts";
const ASSET_FIELD = "src/components/admin/SettingsAssetField.tsx";
const UPLOAD_API = "src/app/api/admin/settings/upload/route.ts";
const HOME_ADMIN = "src/app/admin/pengaturan-beranda/page.tsx";
const THEME_ADMIN = "src/app/admin/tema-branding/page.tsx";
const HOME_PAGE = "src/app/page.tsx";
const LAYOUT = "src/app/layout.tsx";
const NAVBAR = "src/components/Navbar.tsx";
const CAROUSEL = "src/components/HomeBannerCarousel.tsx";
const SERVICE_MENU = "src/components/HomeServiceMenu.tsx";
const PROFILE_HEADER = "src/components/profile/ProfileHeader.tsx";
const PREFLIGHT = "scripts/migration-preflight.mjs";

test("v106 migrasi: kunci baru, policy baca publik, bucket settings-assets", () => {
  assert.ok(exists(MIGRATION), "file migrasi v106 harus ada");
  const sql = read(MIGRATION);

  assert.match(sql, /drop policy if exists "site_settings_public_read" on public\.site_settings;/);
  assert.match(sql, /key in \('info_ticker', 'home_settings', 'theme_settings'\)/);
  assert.match(sql, /values\s+\('home_settings', '\{\}'::jsonb\),\s+\('theme_settings', '\{\}'::jsonb\)/);
  assert.match(sql, /on conflict \(key\) do nothing;/);

  assert.match(sql, /values \('settings-assets', 'settings-assets', true\)/);
  assert.match(sql, /on conflict \(id\) do update set public = true;/);
  assert.match(sql, /create policy "settings_assets_public_read"/);
  assert.match(sql, /create policy "settings_assets_admin_insert"/);
  assert.match(sql, /create policy "settings_assets_admin_delete"/);
  assert.match(sql, /public\.is_admin_or_staff\(\)/);

  // Tidak ada perubahan pada tabel transaksi/saldo.
  assert.doesNotMatch(sql, /(insert into|update|alter table)\s+public\.(wallets|orders|topups|transactions|financial_ledger)/i);
});

test("v106 preflight mengenal migrasi dan urutan wajib berakhir di 106", () => {
  const script = read(PREFLIGHT);
  assert.match(script, /migrations_v106_home_theme_settings\.sql/);
  assert.match(script, /'settings-assets'/);
  assert.match(script, /site_settings_public_read/);
  assert.match(script, /99,100,105,106,107,108,109\]/);
});

test("v106 pengaturan beranda: default dari config, normalisasi, banner terjadwal", () => {
  const lib = read(HOME_LIB);
  assert.match(lib, /export const HOME_SETTINGS_KEY = "home_settings";/);
  assert.match(lib, /import \{\s*DEFAULT_HOME_SERVICES,/);
  assert.match(lib, /services: \{ items: DEFAULT_HOME_SERVICES \}/);
  assert.match(lib, /banners: z\.array\(bannerSchema\)\.max\(20/);
  assert.match(lib, /items: z\.array\(serviceItemSchema\)\.max\(40/);
  assert.match(lib, /icon: z\.string\(\)\.trim\(\)\.refine\(isIconName/);
  assert.match(lib, /export function normalizeHomeSettings/);
  assert.match(lib, /export function visibleHomeBanners/);
  assert.match(lib, /if \(!banner\.isActive \|\| !banner\.imageUrl\) return false;/);
  assert.match(lib, /if \(!Number\.isNaN\(start\) && now < start\) return false;/);
  assert.match(lib, /if \(!Number\.isNaN\(end\) && now > end\) return false;/);
  assert.match(lib, /export function visibleHomeServices/);
  assert.match(lib, /export function orderedHomeSections/);
  assert.match(lib, /sections\.filter\(\(section\) => section\.visible\)\.map/);
  assert.match(lib, /export function homePublishError/);
  assert.match(lib, /Masih ada banner aktif tanpa gambar/);
  assert.match(lib, /settings\.sections\.length !== HOME_SECTION_IDS\.length/);
  assert.match(lib, /ISO -> nilai input datetime-local/);
});

test("v106 tema: font/radius terbatas, kontras 4,5:1, preset, CSS dari nilai tervalidasi", () => {
  const lib = read(THEME_LIB);
  assert.match(lib, /export const THEME_SETTINGS_KEY = "theme_settings";/);
  assert.match(lib, /export const THEME_FONT_KEYS = \["system", "jakarta", "inter", "nunito"\] as const;/);
  assert.match(lib, /export const THEME_RADIUS_KEYS = \["small", "medium", "large"\] as const;/);
  assert.match(lib, /export const THEME_CARD_STYLES = \["flat", "shadow"\] as const;/);
  assert.match(lib, /export const MIN_CONTRAST = 4\.5;/);
  assert.match(lib, /export function contrastRatio/);
  assert.match(lib, /export function themeContrastChecks/);
  assert.match(lib, /export function themePublishError/);
  assert.match(lib, /Kontras .* minimal/);
  assert.match(lib, /export function applyThemePreset/);
  assert.match(lib, /label: "Biru Neon"/);
  assert.match(lib, /label: "Emas Gelap"/);
  assert.match(lib, /label: "Hijau Segar"/);
  assert.match(lib, /recommended: true/);
  assert.match(lib, /export function recommendedThemeSettings/);

  // Default "Biru Neon" (seed + fallback) memakai pasangan warna lengkap.
  assert.match(lib, /primary: "#1573D1"/);
  assert.match(lib, /accent: "#7BD32A"/);
  assert.match(lib, /background: "#F3F6FB"/);
  assert.match(lib, /card2: "#EEF3FA"/);
  assert.match(lib, /border: "#E1E8F2"/);
  assert.match(lib, /primary: "#3AA7FF"/);
  assert.match(lib, /background: "#070B14"/);
  assert.match(lib, /accent: "#8CD93A"/);
  assert.match(lib, /bgFrom: "#0b1220"/);
  assert.match(lib, /bgTo: "#123a66"/);
  assert.match(lib, /font: "inter"/);
  assert.match(lib, /radius: "large"/);

  assert.match(lib, /export const THEME_CSS_VARIABLES = \[/);
  assert.match(lib, /export function buildThemeCss/);
  assert.match(lib, /html:root \{/);
  assert.match(lib, /html\.dark \{/);
  assert.match(lib, /html body \{ font-family: var\(--app-font\); \}/);
  assert.match(lib, /--app-radius-card/);
  assert.match(lib, /--app-card-shadow/);
  assert.match(lib, /html \.btn-gold \{/);

  // Nama variabel dan nilai selalu berasal dari daftar tetap / hex tervalidasi.
  assert.doesNotMatch(lib, /Object\.entries\(settings\)/);
  assert.match(lib, /normalizeHexColor/);
  assert.match(lib, /hexColorSchema/);
});

test("v106 registry: dua kunci baru, izin platform.manage, baca publik, validasi terbit", () => {
  const reg = read(REGISTRY);
  assert.match(reg, /home_settings: \{/);
  assert.match(reg, /theme_settings: \{/);
  assert.match(reg, /key: HOME_SETTINGS_KEY/);
  assert.match(reg, /key: THEME_SETTINGS_KEY/);
  assert.match(reg, /schema: homeSettingsInputSchema/);
  assert.match(reg, /schema: themeSettingsInputSchema/);
  assert.match(reg, /normalize: normalizeHomeSettings/);
  assert.match(reg, /normalize: normalizeThemeSettings/);
  assert.match(reg, /validatePublish: homePublishError/);
  assert.match(reg, /validatePublish: themePublishError/);
  assert.match(reg, /publicRead: true/);
});

test("v106 unggah aset: admin+permission, magic bytes, 2 MB, storage, audit", () => {
  const api = read(UPLOAD_API);
  assert.match(api, /export const dynamic = "force-dynamic";/);
  assert.match(api, /supabase\.auth\.getUser\(\)/);
  assert.match(api, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(String\(profile\.role\)\)/);
  assert.match(api, /supabase\.rpc\("can_admin_permission", \{/);
  assert.match(api, /p_permission: PERMISSION/);
  assert.match(api, /isSettingsAssetKind\(kind\)/);
  assert.match(api, /file\.size > MAX_SETTINGS_ASSET_BYTES/);
  assert.match(api, /sniffSettingsAssetType\(bytes\)/);
  assert.match(api, /admin\.storage\.from\(SETTINGS_ASSET_BUCKET\)\.upload\(path, bytes/);
  assert.match(api, /getPublicUrl\(path\)/);
  assert.match(api, /recordSettingAudit\(access\.user\.id, "settings\.asset_upload"/);
  assert.match(api, /status: 401/);
  assert.match(api, /status: 403/);
  assert.doesNotMatch(api, /writeFile|fs\.promises/);

  const assets = read(ASSETS);
  assert.match(assets, /export const SETTINGS_ASSET_BUCKET = "settings-assets";/);
  assert.match(assets, /export const MAX_SETTINGS_ASSET_BYTES = 2 \* 1024 \* 1024;/);
  assert.match(assets, /\["banner", "logo-light", "logo-dark", "favicon", "og", "operator"\] as const/);
  assert.match(assets, /bytes\[0\] === 0x89 && bytes\[1\] === 0x50/);
  assert.match(assets, /bytes\[0\] === 0xff && bytes\[1\] === 0xd8 && bytes\[2\] === 0xff/);
  assert.match(assets, /bytes\[8\] === 0x57 && bytes\[9\] === 0x45 && bytes\[10\] === 0x42 && bytes\[11\] === 0x50/);
  assert.match(assets, /SVG sengaja tidak diterima/);

  const client = read(ASSET_CLIENT);
  assert.match(client, /banner: \{ width: 1280, height: 560, mode: "cover" \}/);
  assert.match(client, /og: \{ width: 1200, height: 630, mode: "cover" \}/);
  assert.match(client, /"logo-light": \{ width: 512, height: 512, mode: "contain" \}/);
  assert.match(client, /const QUALITY = 0\.86;/);
  assert.match(client, /canvas\.toBlob\([\s\S]*?"image\/webp",\s*QUALITY/);
  assert.match(client, /fetch\("\/api\/admin\/settings\/upload", \{ method: "POST", body: form \}\)/);

  const field = read(ASSET_FIELD);
  assert.match(field, /processAndUploadSettingsAsset\(file, kind\)/);
  assert.match(field, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(field, /maksimal 2 MB · otomatis dikompres WEBP/);
  assert.match(field, /object-cover/);
  assert.match(field, /object-contain/);
});

test("v106 halaman admin memakai SettingsForm dengan validasi + penjaga terbit", () => {
  const home = read(HOME_ADMIN);
  assert.match(home, /"use client";/);
  assert.match(home, /settingKey=\{HOME_SETTINGS_KEY\}/);
  assert.match(home, /validate=\{homeValidate\}/);
  assert.match(home, /publishError=\{homePublishError\}/);
  assert.match(home, /import IconPicker from "@\/components\/icons\/IconPicker";/);
  assert.match(home, /<IconPicker/);
  assert.match(home, /<SettingsAssetField/);
  assert.match(home, /kind="banner"/);
  assert.match(home, /isoToDatetimeLocal/);
  assert.match(home, /datetimeLocalToIso/);
  assert.doesNotMatch(home, /dangerouslySetInnerHTML/);

  const theme = read(THEME_ADMIN);
  assert.match(theme, /"use client";/);
  assert.match(theme, /settingKey=\{THEME_SETTINGS_KEY\}/);
  assert.match(theme, /validate=\{themeValidate\}/);
  assert.match(theme, /publishError=\{themePublishError\}/);
  assert.match(theme, /themeContrastChecks\(value\)/);
  assert.match(theme, /applyThemePreset\(value, preset\.key as ThemePresetKey\)/);
  assert.match(theme, /saveDraft\(recommendedThemeSettings\(value\)\)/);
  assert.match(theme, /Terapkan tema rekomendasi/);
  assert.match(theme, /function PhonePreview/);
  assert.match(theme, /max-w-\[360px\]/);
  assert.match(theme, /<PhonePreview value=\{value\} mode="light" \/>/);
  assert.match(theme, /<PhonePreview value=\{value\} mode="dark" \/>/);
  assert.doesNotMatch(theme, /dangerouslySetInnerHTML/);

  const menu = read("src/lib/admin-menu.ts");
  assert.match(menu, /href: "\/admin\/pengaturan-beranda", icon: "home", label: "Pengaturan Beranda", permission: "platform\.manage"/);
  assert.match(menu, /href: "\/admin\/tema-branding", icon: "sun", label: "Tema & Branding", permission: "platform\.manage"/);
});

test("v106 beranda membaca pengaturan + tema lewat getSetting, urutan bagian dihormati", () => {
  const home = read(HOME_PAGE);
  assert.match(home, /getSetting\(HOME_SETTINGS_KEY,DEFAULT_HOME_SETTINGS\)/);
  assert.match(home, /getSetting\(THEME_SETTINGS_KEY,DEFAULT_THEME_SETTINGS\)/);
  assert.doesNotMatch(home, /from\('home_banners'\)/);

  assert.match(home, /const banners=visibleHomeBanners\(home\)/);
  assert.match(home, /const serviceItems=visibleHomeServices\(home\)/);
  assert.match(home, /orderedHomeSections\(home\)\.map\(section=><Fragment key=\{section\}>\{sectionNodes\[section\]\}<\/Fragment>\)/);
  assert.match(home, /banner:banners\.length>0\?/);
  assert.match(home, /services:serviceItems\.length>0\?<HomeServiceMenu items=\{serviceItems\} media=\{media\|\|\[\]\}\/>:null/);

  // Hero mengikuti pengaturan dan toggle blok tampilan.
  assert.match(home, /\{home\.hero\.description\?<p/);
  assert.match(home, /\{heroHeading\}/);
  assert.match(home, /<span style=\{\{color:"var\(--hero-accent\)"\}\}>\{heroHighlight\}<\/span>/);
  assert.match(home, /showBalance=\{home\.hero\.showBalance\}/);
  assert.match(home, /showLevel=\{home\.hero\.showLevel\}/);
  assert.match(home, /showAccountId=\{home\.hero\.showAccountId\}/);
  assert.match(home, /theme\.identity\.logoLight\|\|'\/aidil-logo\.png'/);

  const header = read(PROFILE_HEADER);
  assert.match(header, /\{showLevel \? <LevelChip transactions=\{transactions\} \/> : null\}/);
  assert.match(header, /\{showAccountId && shortId \?/);
  assert.match(header, /\{showBalance && \(balance === null \?/);
});

test("v106 tema diterapkan server-side tanpa kilatan: font next/font + style di head", () => {
  const layout = read(LAYOUT);
  assert.match(layout, /import \{ Inter, Nunito, Plus_Jakarta_Sans \} from "next\/font\/google";/);
  assert.match(layout, /variable: "--font-jakarta"/);
  assert.match(layout, /variable: "--font-inter"/);
  assert.match(layout, /variable: "--font-nunito"/);
  assert.match(layout, /<style id="theme-vars" dangerouslySetInnerHTML=\{\{ __html: buildThemeCss\(theme\) \}\} \/>/);
  assert.match(layout, /export async function generateMetadata\(\): Promise<Metadata>/);
  assert.match(layout, /getSetting\(THEME_SETTINGS_KEY, DEFAULT_THEME_SETTINGS\)/);
  assert.match(layout, /icons: \{ icon, apple: icon \}/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layout, /brandName=\{theme\.identity\.shopName\}/);
  assert.match(layout, /logoLight=\{theme\.identity\.logoLight\}/);
  assert.match(layout, /logoDark=\{theme\.identity\.logoDark\}/);

  const nav = read(NAVBAR);
  assert.match(nav, /brandName = "AIDIL STORE"/);
  assert.match(nav, /logoLight = ""/);
  assert.match(nav, /logoDark = ""/);
  assert.match(nav, /const brandRest = brandRestParts\.join\(" "\);/);
  assert.match(nav, /dark:hidden/);
  assert.match(nav, /hidden h-full w-full object-cover dark:block/);
});

test("v106 banner kosong tidak menyisakan ruang dan menu layanan ikut pengaturan", () => {
  const carousel = read(CAROUSEL);
  assert.match(carousel, /if \(banners\.length === 0\) return null;/);
  assert.match(carousel, /aspect-\[16\/7\]/);
  assert.match(carousel, /banner\.href\.startsWith\("\/"\)/);
  assert.match(carousel, /target="_blank" rel="noopener noreferrer"/);

  const menu = read(SERVICE_MENU);
  assert.match(menu, /if \(items\.length === 0\) return null;/);
  assert.match(menu, /SERVICE_TABS\.filter\(\(tab\) => presentTabs\.has\(tab\.key\)\)/);
  assert.match(menu, /href=\{`\/ppob\/\$\{item\.slug\}`\}/);
  assert.doesNotMatch(menu, /const ITEMS/);
});

test("v106 tidak menyentuh pembayaran, saldo, PIN, webhook, dan API transaksi", () => {
  const untouched = [
    "src/app/api/topup/route.ts",
    "src/app/api/midtrans/webhook/route.ts",
    "src/app/api/orders/route.ts",
    "src/app/api/wallet/route.ts",
    "src/lib/midtrans.ts",
  ];
  for (const file of untouched) {
    if (!exists(file)) continue;
    assert.doesNotMatch(read(file), /home_settings|theme_settings|settings-assets/);
  }
  for (const file of [HOME_LIB, THEME_LIB, ASSETS, ASSET_CLIENT, UPLOAD_API, HOME_ADMIN, THEME_ADMIN, LAYOUT]) {
    assert.doesNotMatch(read(file), /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'`]/, "tidak ada kunci rahasia hardcoded");
    assert.doesNotMatch(read(file), /MIDTRANS_(SERVER|CLIENT)_KEY\s*=\s*["'`]/);
  }
});
