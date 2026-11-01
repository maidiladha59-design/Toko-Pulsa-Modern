import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const MIGRATION = "supabase/migrations_v109_theme_defaults.sql";
const THEME_LIB = "src/lib/theme-settings.ts";
const THEME_ADMIN = "src/app/admin/tema-branding/page.tsx";
const PREFLIGHT = "scripts/migration-preflight.mjs";

test("v109 migrasi seed tema default hanya menyentuh site_settings", () => {
  assert.ok(exists(MIGRATION), "file migrasi v109 harus ada");
  const sql = read(MIGRATION);

  assert.match(sql, /insert into public\.site_settings \(key, value\)/);
  assert.match(sql, /'theme_settings'/);
  assert.match(sql, /on conflict \(key\) do update/);
  // Hanya mengisi bila belum ada / masih kosong: tema terbit tidak pernah ditimpa.
  assert.match(sql, /where public\.site_settings\.value is null/);
  assert.match(sql, /or public\.site_settings\.value = '\{\}'::jsonb/);
  assert.match(sql, /updated_at = timezone\('utc', now\(\)\)/);

  // Tidak ada tulis ke tabel transaksi/saldo/keuangan.
  assert.doesNotMatch(
    sql,
    /(insert into|update|delete from|alter table)\s+public\.(wallets|orders|topups|transactions|financial_ledger|profiles|products)/i,
  );
});

test("v109 isi seed sama dengan default kode (Biru Neon)", () => {
  const sql = read(MIGRATION);
  const lib = read(THEME_LIB);

  const pairs = [
    ["primary", "#1573D1"],
    ["accent", "#7BD32A"],
    ["background", "#F3F6FB"],
    ["card", "#FFFFFF"],
    ["card2", "#EEF3FA"],
    ["border", "#E1E8F2"],
    ["text", "#0F172A"],
  ];
  for (const [key, value] of pairs) {
    assert.ok(sql.includes(`"${key}": "${value}"`), `seed harus memuat ${key} ${value}`);
    assert.ok(lib.includes(`${key}: "${value}"`), `default kode harus memuat ${key} ${value}`);
  }

  for (const [key, value] of [
    ["primary", "#3AA7FF"],
    ["accent", "#8CD93A"],
    ["background", "#070B14"],
    ["card", "#0F1626"],
    ["card2", "#151E33"],
    ["border", "#1E2A44"],
    ["text", "#F1F5F9"],
  ]) {
    assert.ok(sql.includes(`"${key}": "${value}"`), `seed gelap harus memuat ${key} ${value}`);
    assert.ok(lib.includes(`${key}: "${value}"`), `default gelap harus memuat ${key} ${value}`);
  }

  for (const [key, sqlValue, codeValue] of [
    ["bgFrom", "#0B1220", "#0b1220"],
    ["bgTo", "#123A66", "#123a66"],
    ["accent", "#5CC0FF", "#5cc0ff"],
  ]) {
    assert.ok(sql.includes(`"${key}": "${sqlValue}"`), `seed hero harus memuat ${key} ${sqlValue}`);
    assert.ok(lib.includes(`${key}: "${codeValue}"`), `default hero kode harus memuat ${key} ${codeValue}`);
  }

  for (const literal of ['"font": "inter"', '"radius": "large"', '"cardStyle": "shadow"', '"preset": "neon-blue"', '"heroPreset": "gelap-biru"']) {
    assert.ok(sql.includes(literal), `seed harus memuat ${literal}`);
  }
  assert.match(lib, /font: "inter"/);
  assert.match(lib, /radius: "large"/);
  assert.match(lib, /cardStyle: "shadow"/);
  assert.match(lib, /preset: "neon-blue"/);
  assert.match(lib, /heroPreset: "gelap-biru"/);
});

test("v109 penerapan ulang lewat admin adalah draf, bukan timpa terbit", () => {
  const admin = read(THEME_ADMIN);
  assert.match(admin, /recommendedThemeSettings/);
  assert.match(admin, /saveDraft\(recommendedThemeSettings\(value\)\)/);
  assert.match(admin, /Terapkan tema rekomendasi/);

  const lib = read(THEME_LIB);
  assert.match(lib, /export function recommendedThemeSettings/);
  assert.match(lib, /preset: "neon-blue"/);
  assert.match(lib, /heroPreset: "gelap-biru"/);
});

test("v109 preflight mewajibkan migrasi dan memeriksa klausa non-destruktif", () => {
  const script = read(PREFLIGHT);
  assert.match(script, /migrations_v109_theme_defaults\.sql/);
  assert.match(script, /105,106,107,108,109,110\]/);
  assert.match(script, /'theme_settings'/);
  assert.match(script, /"primary": "#1573d1"/);
  assert.match(script, /value = '\{\}'::jsonb/);
  assert.match(script, /where public\.site_settings\.value is null/);
});
