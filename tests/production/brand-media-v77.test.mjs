import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MIGRATION = "supabase/migrations_v77_brand_media.sql";
const ROUTE = "src/app/api/admin/brand-media/route.ts";
const PAGE = "src/app/admin/brand-media/page.tsx";
const GRID = "src/components/PPOBServiceGrid.tsx";
const SIDEBAR = "src/app/admin/AdminSidebar.tsx";
const MEDIA_ROUTE = "src/app/api/admin/media/route.ts";
const PLATFORM = "src/app/admin/platform/page.tsx";

test('v77 migrasi brand_media aman dijalankan ulang (idempotent)', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create table if not exists public\.brand_media \(/);
  assert.match(sql, /brand_key text primary key,/);
  assert.match(sql, /brand_name text not null check \(btrim\(brand_name\) <> ''\),/);
  assert.match(sql, /logo_url text not null check \(logo_url like 'https:\/\/%'\),/);
  assert.match(sql, /updated_by uuid references public\.profiles\(id\) on delete set null,/);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/);
  assert.match(sql, /drop policy if exists "brand_media_select_all" on public\.brand_media;/);
  assert.match(sql, /drop policy if exists "brand_media_admin_write" on public\.brand_media;/);
});

test('v77 RLS: semua orang SELECT, tulis hanya ADMIN/SUPER_ADMIN via is_admin()', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /alter table public\.brand_media enable row level security;/);
  assert.match(sql, /create policy "brand_media_select_all" on public\.brand_media\s+for select using \(true\);/);
  assert.match(sql, /create policy "brand_media_admin_write" on public\.brand_media\s+for all using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\);/);
  assert.match(sql, /revoke all on public\.brand_media from public, anon, authenticated;/);
  assert.match(sql, /grant select on public\.brand_media to anon, authenticated;/);
});

test('v77 GET /api/admin/brand-media: hanya admin, brand unik dari ppob_services + logo tersimpan', () => {
  const s = read(ROUTE);
  assert.match(s, /\["ADMIN", "SUPER_ADMIN"\]\.includes\(profile\.role\)/);
  assert.match(s, /from\("ppob_services"\)/);
  assert.match(s, /not\("brand", "is", null\)/);
  assert.match(s, /\.from\("brand_media"\)\s+\.select\("brand_key, brand_name, logo_url, updated_at"\)/);
  assert.match(s, /product_count/);
});

test('v77 POST /api/admin/brand-media: Zod, wajib https, nama wajib, upsert + audit', () => {
  const s = read(ROUTE);
  assert.match(s, /upsertSchema\.safeParse/);
  assert.match(s, /brand_name: z\.string\(\)\.trim\(\)\.min\(1, "Nama brand wajib diisi\."\)/);
  assert.match(s, /\.startsWith\("https:\/\/", "URL logo wajib diawali https\:\/\/"\)/);
  assert.match(s, /\.upsert\(/);
  assert.match(s, /\{ onConflict: "brand_key" \}/);
  assert.match(s, /from\("audit_logs"\)\.insert/);
  assert.match(s, /brandmedia\.update/);
});

test('v77 DELETE /api/admin/brand-media: hapus logo per brand + audit', () => {
  const s = read(ROUTE);
  assert.match(s, /export async function DELETE\(request: Request\)/);
  assert.match(s, /\.delete\(\)\.eq\("brand_key", brandKey\)/);
  assert.match(s, /brandmedia\.delete/);
});

test('v77 halaman admin: daftar brand, upload via /api/admin/media folder brand-logos, tombol hapus', () => {
  assert.ok(exists(PAGE), PAGE);
  const p = read(PAGE);
  assert.match(p, /fetch\('\/api\/admin\/brand-media'\)/);
  assert.match(p, /fetch\('\/api\/admin\/media',\{method:'POST',body:fd\}\)/);
  assert.match(p, /fd\.append\('folder','brand-logos'\)/);
  assert.match(p, /method:'DELETE'/);
  assert.match(p, /accept="image\/jpeg,image\/png,image\/webp,image\/svg\+xml,application\/pdf"/);
  assert.match(p, /Mengunggah\.\.\./);
  assert.match(p, /brand\.logo_url\?\(brand\.logo_url\.toLowerCase\(\)\.endsWith\('\.pdf'\)/);
  assert.match(p, /<img src=\{brand\.logo_url\} alt=\{brand\.brand_name\}/);
  assert.match(p, /Jaringan gagal/);
  assert.match(p, /🖼️/);
});

test('v77 upload media menerima JPG/PNG/WEBP/SVG/PDF, maks 5MB, Storage tidak berubah', () => {
  const m = read(MEDIA_ROUTE);
  assert.match(m, /const allowed=\['image\/jpeg','image\/png','image\/webp','image\/svg\+xml','application\/pdf'\];/);
  assert.match(m, /file\.size>5\*1024\*1024/);
  assert.match(m, /Ukuran file maksimal 5MB/);
  assert.match(m, /Format tidak didukung\. Gunakan JPG, PNG, WEBP, SVG, atau PDF\./);
  assert.match(m, /\.storage\.from\('site-media'\)\.upload\(path,file,\{contentType:file\.type,upsert:false\}\)/);
});

test('v77 halaman platform: accept baru, ikon PDF banner, indikator Mengunggah', () => {
  assert.ok(exists(PLATFORM), PLATFORM);
  const p = read(PLATFORM);
  assert.match(p, /accept="image\/jpeg,image\/png,image\/webp,image\/svg\+xml,application\/pdf"/);
  assert.match(p, /uploading&&<span className="ml-3 text-xs font-black text-gold-600">Mengunggah\.\.\.<\/span>/);
  assert.match(p, /b\.file_type==='pdf'\?'📄 PDF':'🖼️ Gambar'/);
  assert.match(p, /Jaringan gagal\. Periksa koneksi internet lalu coba lagi\./);
  assert.match(p, /file_type:f\.type==='application\/pdf'\?'pdf':'image'/);
});

test('v77 menu "Logo Brand" terpasang di AdminSidebar', () => {
  const s = read(SIDEBAR);
  assert.match(s, new RegExp(esc('["/admin/brand-media", "🖼️", "Logo Brand"]')));
});

test('v77 PPOBServiceGrid membaca brand_media (client publik) dan fallback emoji tetap ada', () => {
  const g = read(GRID);
  assert.match(g, /import \{ createClient \} from "@\/lib\/supabase\/client";/);
  assert.match(g, /from\("brand_media"\)/);
  assert.match(g, /select\("brand_key,logo_url"\)/);
  assert.match(g, /logoMap\[brand\.trim\(\)\.toLowerCase\(\)\]/);
  // Fallback emoji tidak hilang
  assert.match(g, /brandIcon\(brand\)/);
  assert.match(g, /function brandIcon\(brand: string\)/);
  // Logic checkout/PPOB tidak berubah
  assert.match(g, /\/checkout\?product=\$\{encodeURIComponent\(p\.id\)\}&qty=1/);
  assert.match(g, /groupByBrand\(filtered\)/);
});

test('v77 terdaftar di migration preflight', () => {
  const preflight = read('scripts/migration-preflight.mjs');
  assert.match(preflight, /55,73,75,76,77\]/);
  assert.match(preflight, /migrations_v77_brand_media\.sql/);
});
