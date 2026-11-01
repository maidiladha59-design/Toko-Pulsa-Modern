import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const MIGRATION = "supabase/migrations_v105_managed_settings.sql";
const PURE = "src/lib/managed-settings.ts";
const SERVER = "src/lib/settings.ts";
const API = "src/app/api/admin/settings/[key]/route.ts";
const FORM = "src/components/admin/SettingsForm.tsx";
const DIALOG = "src/components/admin/ConfirmDialog.tsx";
const SYSTEM_PAGE = "src/app/admin/system/page.tsx";
const SYSTEM_API = "src/app/api/admin/system/cache/route.ts";
const PREFLIGHT = "scripts/migration-preflight.mjs";

test("v105 migrasi: kolom draf/versi, riwayat, RLS, tanpa policy tulis klien", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /alter table public\.site_settings\s+add column if not exists draft jsonb,/);
  assert.match(sql, /add column if not exists version integer not null default 1,/);
  assert.match(sql, /add column if not exists draft_updated_at timestamptz,/);
  assert.match(sql, /add column if not exists draft_updated_by uuid references auth\.users\(id\)/);
  assert.match(sql, /constraint site_settings_draft_object check \(draft is null or jsonb_typeof\(draft\) = 'object'\)/);
  assert.match(sql, /constraint site_settings_version_positive check \(version > 0\)/);

  assert.match(sql, /create table if not exists public\.site_settings_history/);
  assert.match(sql, /action text not null check \(action in \('publish', 'restore'\)\)/);
  assert.match(sql, /create index if not exists site_settings_history_key_created_idx/);
  assert.match(sql, /alter table public\.site_settings_history enable row level security/);
  assert.match(sql, /revoke all on public\.site_settings_history from public, anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/i, "tidak ada policy tulis maupun baca langsung untuk riwayat");
});

test("v105 RPC: kunci baris FOR UPDATE, tolak versi berubah, riwayat hanya saat terbit/pulih", () => {
  const sql = read(MIGRATION);
  for (const fn of [
    "save_site_setting_draft",
    "publish_site_setting",
    "discard_site_setting_draft",
    "restore_site_setting_version",
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}\\(`));
  }
  assert.equal((sql.match(/for update;/g) || []).length, 4, "semua RPC mengunci baris");
  assert.equal((sql.match(/if v_row\.version <> p_base_version then/g) || []).length, 4);
  assert.equal((sql.match(/raise exception 'SETTING_VERSION_CONFLICT';/g) || []).length, 4);
  assert.match(sql, /raise exception 'SETTING_HISTORY_NOT_FOUND';/);
  assert.match(sql, /language plpgsql\s+security definer\s+set search_path = public, pg_temp/);

  // Terbit: naik versi + simpan riwayat + kosongkan draf dalam satu transaksi.
  assert.match(sql, /v_next := v_row\.version \+ 1;/);
  assert.match(sql, /insert into public\.site_settings_history\(key, value, version, action, created_by\)\s+values \(p_key, p_value, v_next, 'publish', p_actor\);/);
  assert.match(sql, /set value = p_value,\s+draft = null,/);

  // Pemulihan hanya membuat draf; terbit tetap manual.
  assert.match(sql, /values \(p_key, v_source, v_row\.version, 'restore', p_actor\);/);
  assert.match(sql, /set draft = v_source,/);
});

test("v105 RPC hanya untuk service role dan seed tidak menimpa nilai lama", () => {
  const sql = read(MIGRATION);
  for (const signature of [
    "save_site_setting_draft(text, jsonb, integer, uuid)",
    "publish_site_setting(text, jsonb, integer, uuid)",
    "discard_site_setting_draft(text, integer, uuid)",
    "restore_site_setting_version(text, bigint, integer, uuid)",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")} from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")} to service_role;`));
  }
  assert.match(sql, /insert into public\.site_settings \(key, value, version\)/);
  assert.match(sql, /on conflict \(key\) do nothing;/);
});

test("v105 preflight mengenal migrasi dan urutan wajib berakhir di 105", () => {
  const script = read(PREFLIGHT);
  assert.match(script, /migrations_v105_managed_settings\.sql/);
  assert.match(script, /site_settings_history/);
  assert.match(script, /save_site_setting_draft/);
  assert.match(script, /publish_site_setting/);
  assert.match(script, /restore_site_setting_version/);
  assert.match(script, /setting_version_conflict/);
  assert.match(script, /99,100,105,106,107,108\]/);
});

test("v105 lib murni: registry kunci, tag per kunci, hex valid, URL internal/https, teks biasa", () => {
  const lib = read(PURE);
  assert.match(lib, /export function settingTag\(key: string\): string/);
  assert.match(lib, /return `settings:\$\{key\}`;/);
  assert.match(lib, /export const MANAGED_SETTINGS = \{/);
  assert.match(lib, /info_ticker: \{/);
  assert.match(lib, /permission: "platform\.manage"/);
  assert.match(lib, /export function parseSettingValue\(key: string, value: unknown\): SettingParseResult/);
  assert.match(lib, /export function allSettingsCacheTags\(\): string\[\]/);
  assert.match(lib, /export const CATALOG_CACHE_TAGS = \["catalog", "feature-flags"\] as const;/);
  assert.match(lib, /export const BANNER_CACHE_TAGS = \["banners", "home-banners"\] as const;/);

  // Warna hanya hex; URL hanya path internal atau https (primitif dipisah v106).
  const primitives = read("src/lib/setting-primitives.ts");
  assert.match(lib, /from "@\/lib\/setting-primitives"/);
  assert.match(primitives, /\^#\(\?:\[0-9a-fA-F\]\{3\}\|\[0-9a-fA-F\]\{4\}\|\[0-9a-fA-F\]\{6\}\|\[0-9a-fA-F\]\{8\}\)\$/);
  assert.match(primitives, /if \(value\.startsWith\("\/\/"\)\) return false;/);
  assert.match(primitives, /return \/\^https:\\\/\\\/\[\^\\s\]\+\$\/i\.test\(value\);/);
  assert.match(primitives, /URL hanya boleh path internal \(diawali \/\) atau https\./);

  // Modul murni aman untuk bundel browser.
  assert.doesNotMatch(lib, /from "next\/cache"/);
  assert.doesNotMatch(lib, /@supabase\/supabase-js/);
  assert.doesNotMatch(lib, /process\.env/);
});

test("v105 getSetting: cache per request + unstable_cache 60 detik bertag, gagal = default", () => {
  const lib = read(SERVER);
  assert.match(lib, /import \{ cache \} from "react";/);
  assert.match(lib, /import \{ revalidateTag, unstable_cache \} from "next\/cache";/);
  assert.match(lib, /const readSettingOnce = cache\(async \(key: string\) => readerFor\(key\)\(\)\);/);
  assert.match(lib, /\["managed-setting", key\]/);
  assert.match(lib, /\{ revalidate: 60, tags \}/);
  assert.match(lib, /if \(!raw\) return defaults;/);
  assert.match(lib, /if \(!def\) return merged as T;/);
  assert.match(lib, /if \(!parsed\.success\) return defaults;/);
  assert.match(lib, /catch \{\s*return defaults;\s*\}/);
  assert.match(lib, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(lib, /if \(!publicRead\) return null;/);

  // Tulis lewat service role + RPC berversi, bukan update langsung dari klien.
  assert.match(lib, /createAdminClient\(\)/);
  assert.match(lib, /admin\.rpc\("save_site_setting_draft"/);
  assert.match(lib, /admin\.rpc\("publish_site_setting"/);
  assert.match(lib, /admin\.rpc\("discard_site_setting_draft"/);
  assert.match(lib, /admin\.rpc\("restore_site_setting_version"/);
  assert.match(lib, /class SettingConflictError extends Error/);

  // Invalidasi tag + pembersihan seluruh tag settings/katalog/banner.
  assert.match(lib, /export function revalidateSetting\(key: string\): string\[\]/);
  assert.match(lib, /for \(const tag of tags\) revalidateTag\(tag\);/);
  assert.match(lib, /export function clearAllCaches\(\): string\[\]/);
  assert.match(lib, /allSettingsCacheTags\(\), \.\.\.CATALOG_CACHE_TAGS, \.\.\.BANNER_CACHE_TAGS/);
});

test("v105 beranda membaca info_ticker lewat getSetting (bukan tabel langsung)", () => {
  const site = read("src/lib/site-settings.ts");
  assert.match(site, /import \{ getSetting \} from "@\/lib\/settings";/);
  assert.match(site, /export async function getInfoTicker\(\): Promise<InfoTickerSettings>/);
  assert.match(site, /getSetting<InfoTickerSettings>\(INFO_TICKER_KEY, DEFAULT_INFO_TICKER\)/);
  assert.doesNotMatch(site, /unstable_cache|createClient/);
});

test("v105 API pengaturan: auth + role + permission di server, validasi skema, 409 konflik", () => {
  const api = read(API);
  assert.match(api, /export const dynamic = "force-dynamic";/);
  assert.match(api, /supabase\.auth\.getUser\(\)/);
  assert.match(api, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(String\(profile\.role\)\)/);
  assert.match(api, /supabase\.rpc\("can_admin_permission", \{/);
  assert.match(api, /p_permission: def\.permission/);
  assert.match(api, /status: 401/);
  assert.match(api, /status: 403/);
  assert.doesNotMatch(api, /service_role\)?.*from\("profiles"\)/, "role dibaca dari sesi, bukan service role");

  assert.match(api, /action: z\.enum\(\["save_draft", "publish", "discard_draft", "restore", "reset_default"\]\)/);
  assert.match(api, /baseVersion: z\.number\(\)\.int\(\)\.min\(0\)/);
  assert.match(api, /const parsed = parseSettingValue\(params\.key, input\);/);
  assert.match(api, /code: "VERSION_CONFLICT"/);
  assert.match(api, /status: 409/);
  assert.match(api, /const tags = action === "publish" \? revalidateSetting\(params\.key\) : \[\];/);

  for (const action of [
    "settings.draft_save",
    "settings.publish",
    "settings.draft_discard",
    "settings.restore",
    "settings.reset_default",
  ]) {
    assert.match(api, new RegExp(action.replace(".", "\\.")));
  }
  assert.doesNotMatch(api, /console\.log\(|dangerouslySetInnerHTML/);
});

test("v105 SettingsForm: draf/terbit/buang/default, penanda draf, pratinjau 360px, riwayat + pulihkan", () => {
  const form = read(FORM);
  assert.match(form, /"use client";/);
  assert.match(form, /Simpan Draf/);
  assert.match(form, />\s*Terbitkan\s*</);
  assert.match(form, /Buang Draf/);
  assert.match(form, /Kembalikan Default/);
  assert.match(form, /Ada draf belum diterbitkan/);
  assert.match(form, /Riwayat Versi/);
  assert.match(form, /Pulihkan versi ini/);
  assert.match(form, /Versi \{entry\.version\}/);
  assert.match(form, /max-w-\[360px\]/);
  assert.match(form, /renderPreview/);
  assert.match(form, /Lihat isi/);

  // Peringatan pindah halaman dengan perubahan belum disimpan.
  assert.match(form, /window\.addEventListener\("beforeunload", onBeforeUnload\)/);
  assert.match(form, /if \(!dirty\) return;/);
  assert.match(form, /Perubahan belum disimpan/);

  // Konflik versi dan pemulihan selalu jadi draf.
  assert.match(form, /json\?\.code === "VERSION_CONFLICT"/);
  assert.match(form, /Pengaturan sudah diubah admin lain/);
  assert.match(form, /Pulihkan sebagai draf/);
  assert.match(form, /request\("restore", \{ historyId: pendingConfirm\.entry\.id \}\)/);

  // Teks admin tidak pernah dirender sebagai HTML.
  assert.doesNotMatch(form, /dangerouslySetInnerHTML=/);
  assert.doesNotMatch(form, /\{__html/);
  assert.doesNotMatch(form, /\.innerHTML\s*=/);
  assert.doesNotMatch(form, /from "@\/lib\/settings"/, "komponen client tidak menarik modul server");
});

test("v105 dialog admin portaled ke body dan tidak menahan transform konten", () => {
  const dialog = read(DIALOG);
  assert.match(dialog, /"use client";/);
  assert.match(dialog, /createPortal\(/);
  assert.match(dialog, /document\.body/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /z-\[1000\]/);
  assert.match(dialog, /body\.style\.overflow = "hidden"/);
});

test("v105 halaman Sistem: bersihkan cache wajib konfirmasi + audit, menu admin tersedia", () => {
  assert.ok(exists(SYSTEM_PAGE));
  const page = read(SYSTEM_PAGE);
  assert.match(page, /Bersihkan Cache/);
  assert.match(page, /fetch\("\/api\/admin\/system\/cache", \{/);
  assert.match(page, /body: JSON\.stringify\(\{ confirm: true \}\)/);
  assert.match(page, /disabled=\{!confirmed \|\| clearing\}/);
  assert.match(page, /allSettingsCacheTags\(\)/);
  assert.match(page, /CATALOG_CACHE_TAGS/);
  assert.match(page, /BANNER_CACHE_TAGS/);
  assert.match(page, /<ConfirmDialog/);

  const menu = read("src/lib/admin-menu.ts");
  assert.match(menu, /href: "\/admin\/system", icon: "settings", label: "Sistem", permission: "platform\.manage"/);
});

test("v105 API cache: role + permission server, konfirmasi wajib, audit system.cache_clear", () => {
  const api = read(SYSTEM_API);
  assert.match(api, /supabase\.auth\.getUser\(\)/);
  assert.match(api, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(String\(profile\.role\)\)/);
  assert.match(api, /p_permission: "platform\.manage"/);
  assert.match(api, /z\.object\(\{ confirm: z\.literal\(true\) \}\)\.strict\(\)/);
  assert.match(api, /Konfirmasi wajib dicentang/);
  assert.match(api, /const tags = clearAllCaches\(\);/);
  assert.match(api, /recordSystemAudit\(access\.user\.id, "system\.cache_clear"/);
  assert.match(api, /status: 401/);
  assert.match(api, /status: 403/);
});

test("v105 tidak menyentuh pembayaran, saldo, PIN, webhook, dan API transaksi", () => {
  const untouched = [
    "src/app/api/topup/route.ts",
    "src/app/api/midtrans/webhook/route.ts",
    "src/app/api/orders/route.ts",
    "src/app/api/wallet/route.ts",
    "src/lib/midtrans.ts",
  ];
  for (const file of untouched) {
    if (!exists(file)) continue;
    assert.doesNotMatch(read(file), /site_settings_history|publish_site_setting|managed-settings/);
  }
  for (const file of [API, FORM, SYSTEM_API, SYSTEM_PAGE, SERVER, PURE]) {
    assert.doesNotMatch(read(file), /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'`]/, "tidak ada kunci rahasia hardcoded");
    assert.doesNotMatch(read(file), /MIDTRANS_(SERVER|CLIENT)_KEY\s*=\s*["'`]/);
  }
});
