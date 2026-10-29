import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const MIGRATION = "supabase/migrations_v99_icon_registry.sql";
const REGISTRY = "src/components/icons/registry.ts";
const MAP = "src/components/icons/emoji-map.ts";
const ICON = "src/components/icons/Icon.tsx";
const PICKER = "src/components/icons/IconPicker.tsx";
const TICKER_LIB = "src/lib/info-ticker.ts";
const TICKER_PAGE = "src/app/admin/info-ticker/page.tsx";
const NOTIF_PAGE = "src/app/notifications/page.tsx";
const ENGINE = "src/lib/notification-engine.ts";

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

function registryNames() {
  return [...read(REGISTRY).matchAll(/^ {2}([a-z][a-z0-9_]*): \[/gm)].map((m) => m[1]);
}

/** Escape satu karakter ke bentuk yang dipakai emoji-map.ts (\u{1F4F1} atau \u26A1). */
function mapEscape(ch) {
  const cp = ch.codePointAt(0);
  return cp > 0xffff
    ? `\\u{${cp.toString(16).toUpperCase()}}`
    : `\\u${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

function mappedTokens() {
  const src = read(MAP);
  const body = src.slice(src.indexOf("EMOJI_TO_ICON"), src.indexOf("};", src.indexOf("EMOJI_TO_ICON")));
  const rows = [...body.matchAll(/^\s*"((?:[^"\\]|\\.)+)":\s*"([a-z0-9_]+)"/gm)];
  return rows.map((m) => ({ token: m[1], icon: m[2] }));
}

function sqlTokens() {
  const sql = read(MIGRATION);
  const body = sql.split("insert into public.emoji_icon_map (emoji, icon_key) values")[1].split("on conflict")[0];
  return [...body.matchAll(/^\s*\('([^']*)', '([a-z0-9_]+)'\)/gm)].map((m) => ({
    token: Array.from(m[1]).map(mapEscape).join(""),
    icon: m[2],
  }));
}

test('v99 migrasi icon registry: peta emoji, fungsi konversi, kolom ikon notifikasi', () => {
  assert.ok(exists(MIGRATION), MIGRATION);
  const sql = read(MIGRATION);
  assert.match(sql, /create table if not exists public\.emoji_icon_map \(/);
  assert.match(sql, /emoji\s+text not null primary key,/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /on conflict \(emoji\) do update/);
  assert.match(sql, /create or replace function public\.icon_key_from_text\(p_input text\)/);
  assert.match(sql, /create or replace function public\.strip_pictographs\(p_input text\)/);
  assert.match(sql, /add column if not exists icon text not null default 'bell'/);
  assert.match(sql, /add constraint notification_templates_icon_key check \(icon ~ '\^\[a-z\]\[a-z0-9_\]\{1,23\}\$'\)/);
  assert.match(sql, /add constraint notifications_icon_key check \(icon ~ '\^\[a-z\]\[a-z0-9_\]\{1,23\}\$'\)/);
  assert.match(sql, /drop constraint if exists site_settings_info_ticker_bounds/);
  assert.match(sql, /add constraint site_settings_info_ticker_bounds check/);
  assert.match(sql, /~\s+'\^\(none\|\[a-z\]\[a-z0-9_\]\{1,23\}\)\$'/);
  // Tidak boleh ada operasi destruktif pada data transaksi.
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /delete from public\.(transactions|orders|profiles|wallets)/i);
});

test('v99 peta emoji di emoji-map.ts sinkron dengan migrasi SQL', () => {
  const js = mappedTokens();
  const sql = sqlTokens();
  assert.ok(js.length >= 120, `peta JS minimal 120 entri, dapat ${js.length}`);
  assert.equal(js.length, sql.length, "jumlah baris peta JS dan SQL harus sama");
  const jsMap = new Map(js.map((row) => [row.token, row.icon]));
  const sqlMap = new Map(sql.map((row) => [row.token, row.icon]));
  const onlyJs = [...jsMap.keys()].filter((key) => !sqlMap.has(key));
  const onlySql = [...sqlMap.keys()].filter((key) => !jsMap.has(key));
  const different = [...jsMap.entries()].filter(([key, icon]) => sqlMap.has(key) && sqlMap.get(key) !== icon);
  assert.deepEqual(onlyJs, [], "token hanya ada di JS");
  assert.deepEqual(onlySql, [], "token hanya ada di SQL");
  assert.deepEqual(different, [], "token dipetakan ke ikon berbeda");
});

test('v99 setiap emoji lama dipetakan ke nama ikon yang ada di registry', () => {
  const names = new Set(registryNames());
  const unknown = mappedTokens().filter((row) => !names.has(row.icon));
  assert.deepEqual(unknown, [], "ikon hasil peta harus ada di registry");
});

test('v99 registry ikon: 124 nama unik, default tersedia, gaya SVG konsisten', () => {
  const names = registryNames();
  assert.equal(names.length, 124, "jumlah ikon registry berubah tanpa memperbarui dokumentasi");
  assert.equal(new Set(names).size, names.length, "nama ikon duplikat");
  assert.ok(names.includes("default"), "fallback default wajib ada");
  assert.ok(names.includes("heart_fill"), "ikon hati terisi untuk tombol favorit");
  assert.ok(registryNames().every((name) => /^[a-z][a-z0-9_]{1,23}$/.test(name)), "nama ikon harus slug");
  assert.match(read(REGISTRY), /export const DEFAULT_ICON_NAME: IconName = "default";/);
  assert.match(read(REGISTRY), /export function isIconName\(value: unknown\): value is IconName/);

  const icon = read(ICON);
  assert.match(icon, /viewBox="0 0 24 24"/);
  assert.match(icon, /stroke="currentColor"/);
  assert.match(icon, /strokeLinecap="round"/);
  assert.match(icon, /strokeLinejoin="round"/);
  assert.match(icon, /aria-hidden=\{labelled \? undefined : true\}/);
  assert.match(icon, /role=\{labelled \? "img" : undefined\}/);
  assert.match(icon, /const key: IconName = mapEmojiToIcon\(name\);/);
  assert.match(icon, /ICON_REGISTRY\[key\] \?\? ICON_REGISTRY\[DEFAULT_ICON_NAME\]/);
});

test('v99 pemilih ikon admin: pencarian, pratinjau, catatan, opsi tanpa ikon', () => {
  const picker = read(PICKER);
  assert.match(picker, /import \{ ICON_NAMES \} from "\.\/registry";/);
  assert.match(picker, /const \[query, setQuery\] = useState\(""\);/);
  assert.match(picker, /placeholder="Cari nama ikon, mis\. wallet"/);
  assert.match(picker, /Pratinjau ikon \$\{selected\}/);
  assert.match(picker, /Gunakan pemilih ikon, bukan emoji\./);
  assert.match(picker, /allowNone = false/);
  assert.match(picker, /const isNone = allowNone && value === "none";/);
  assert.match(picker, /onChange: \(name: IconName \| "none"\) => void;/);
  assert.match(picker, /<Icon name=\{selected\} size=\{28\}/);
  assert.match(picker, /<IconTile name=\{selected\} size=\{44\} iconSize=\{24\} \/>/);
  // Hanya ikon dari registry yang bisa dipilih.
  assert.match(picker, /ICON_NAMES\.filter\(\(name\) => name\.includes\(needle\)\)/);
  assert.doesNotMatch(picker, /<option value="/);
});

test('v99 panel info berjalan memakai IconPicker, bukan input emoji', () => {
  const page = read(TICKER_PAGE);
  assert.match(page, /import IconPicker from "@\/components\/icons\/IconPicker";/);
  assert.match(page, /<IconPicker allowNone label="Ikon" value=\{form\.icon\}/);
  assert.doesNotMatch(page, /<option value="megaphone"/);
  assert.doesNotMatch(page, /placeholder="[^"]*emoji/i);
});

test('v99 validasi server info berjalan memakai daftar ikon registry', () => {
  const lib = read(TICKER_LIB);
  assert.match(lib, /import \{ ICON_NAMES, type IconName \} from "@\/components\/icons\/registry";/);
  assert.match(lib, /export type TickerIcon = IconName \| "none";/);
  assert.match(lib, /const TICKER_ICON_VALUES = \["none", \.\.\.ICON_NAMES\] as \[TickerIcon, \.\.\.TickerIcon\[\]\];/);
  assert.match(lib, /icon: z\.enum\(TICKER_ICON_VALUES, \{/);
  assert.match(lib, /Ikon harus dipilih dari daftar ikon yang tersedia\./);

  const route = read("src/app/api/admin/info-ticker/route.ts");
  assert.match(route, /infoTickerInputSchema\.safeParse\(input\)/);
});

test('v99 notifikasi menyimpan dan menampilkan kunci ikon dengan fallback bell', () => {
  const engine = read(ENGINE);
  assert.match(engine, /icon: template\.icon \?\? 'bell'/);
  const page = read(NOTIF_PAGE);
  assert.match(page, /import Icon from'@\/components\/icons\/Icon';/);
  assert.match(page, /<Icon name=\{x\.icon\|\|'bell'\} size=\{18\}\/>/);
});

test('v99 penjaga emoji terpasang di lint dan hanya mengizinkan file pemetaan', () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.lint, /npm run check:emoji && next lint/);
  assert.equal(pkg.scripts["check:emoji"], "node scripts/check-emoji.mjs --guard src");
  assert.ok(exists("scripts/check-emoji.mjs"));

  const guard = read("scripts/check-emoji.mjs");
  assert.match(guard, /const GUARD_ALLOWLIST = \[/);
  assert.match(guard, /"src\/components\/icons\/emoji-map\.ts",/);
  assert.match(guard, /"supabase\/migrations_v99_icon_registry\.sql",/);
  assert.match(guard, /if \(mode === "guard" && \(/);
  assert.match(guard, /GAGAL: \$\{blocking\} baris memakai emoji\/simbol dekoratif\./);
  assert.match(guard, /OK: tidak ada emoji di luar file pemetaan yang diizinkan\./);
});

test('v99 tidak ada emoji tersisa di src di luar file pemetaan', () => {
  const allowed = new Set(["src/components/icons/emoji-map.ts"]);
  const hits = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(tsx?|jsx?|mjs|css|md)$/i.test(entry.name)) continue;
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (allowed.has(rel)) continue;
      if (PICTOGRAPHIC.test(fs.readFileSync(full, "utf8"))) hits.push(rel);
    }
  };
  walk(path.join(root, "src"));
  assert.deepEqual(hits, [], "emoji masih tampil di berkas berikut");
});

test('v99 terdaftar di migration preflight', () => {
  const preflight = read("scripts/migration-preflight.mjs");
  assert.match(preflight, /,99\]/);
  assert.match(preflight, /migrations_v99_icon_registry\.sql/);
  assert.match(preflight, /emoji_icon_map/);
  assert.match(preflight, /icon_key_from_text/);
  assert.match(preflight, /strip_pictographs/);
});
