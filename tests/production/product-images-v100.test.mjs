import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MIGRATION = "supabase/migrations_v100_product_images.sql";
const ROUTE = "src/app/api/admin/product-images/route.ts";
const LIB = "src/lib/product-image.ts";
const CLIENT = "src/lib/product-image-client.ts";
const COMPONENT = "src/components/ProductImage.tsx";
const ADMIN_PAGE = "src/app/admin/product-images/page.tsx";
const ADMIN_PRODUCTS = "src/app/admin/products/page.tsx";
const GRID = "src/components/PPOBServiceGrid.tsx";
const HOME = "src/app/page.tsx";
const DETAIL = "src/app/products/[slug]/page.tsx";
const CHECKOUT = "src/app/checkout/page.tsx";
const PROFILE = "src/app/profile/page.tsx";
const MENU = "src/lib/admin-menu.ts";

test("v100 migrasi product_images terpisah dari data sync + aman dijalankan ulang", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create table if not exists public\.product_images \(/);
  assert.match(sql, /product_id uuid primary key references public\.products\(id\) on delete cascade,/);
  assert.match(sql, /image_url text not null check \(image_url like 'https:\/\/%'\),/);
  assert.match(sql, /alt_text text check \(alt_text is null or char_length\(alt_text\) <= 160\),/);
  assert.match(sql, /updated_by uuid references public\.profiles\(id\) on delete set null,/);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/);
  assert.match(sql, /create index if not exists idx_product_images_updated_at/);
  assert.match(sql, /-- Tabel gambar produk yang TERPISAH dari baris produk hasil sinkronisasi supplier\./);
});

test("v100 RLS: SELECT publik, tulis hanya ADMIN/SUPER_ADMIN lewat is_admin()", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /alter table public\.product_images enable row level security;/);
  assert.match(sql, /create policy "product_images_select_all" on public\.product_images\s+for select using \(true\);/);
  assert.match(sql, /create policy "product_images_admin_write" on public\.product_images\s+for all using \(public\.is_admin\(\)\) with check \(public\.is_admin\(\)\);/);
  assert.match(sql, /revoke all on public\.product_images from public, anon, authenticated;/);
  assert.match(sql, /grant select on public\.product_images to anon, authenticated;/);
});

test("v100 lib gambar: prioritas produk -> brand -> kategori -> ikon", () => {
  const s = read(LIB);
  assert.match(s, /if \(ownImage\) return \{ src: ownImage, source: "product" \};/);
  assert.match(s, /if \(legacyImage\) return \{ src: legacyImage, source: "product" \};/);
  assert.match(s, /if \(brandLogo\) return \{ src: brandLogo, source: "brand" \};/);
  assert.match(s, /if \(categoryImage\) return \{ src: categoryImage, source: "category" \};/);
  assert.match(s, /return \{ src: null, source: "default" \};/);
});

test("v100 validasi tipe memakai magic bytes, bukan header MIME", () => {
  const s = read(LIB);
  assert.match(s, /export function sniffProductImageType\(bytes: Uint8Array\)/);
  assert.match(s, /0x89 && bytes\[1\] === 0x50 && bytes\[2\] === 0x4e && bytes\[3\] === 0x47/);
  assert.match(s, /bytes\[0\] === 0xff && bytes\[1\] === 0xd8 && bytes\[2\] === 0xff/);
  assert.match(s, /bytes\[8\] === 0x57 && bytes\[9\] === 0x45 && bytes\[10\] === 0x42 && bytes\[11\] === 0x50/);
  assert.match(s, /PRODUCT_IMAGE_TYPES = \["image\/png", "image\/jpeg", "image\/webp"\] as const/);
  assert.match(s, /MAX_PRODUCT_IMAGE_INPUT_BYTES = 2 \* 1024 \* 1024/);
});

test("v100 normalisasi nama brand/file untuk drag-drop multi-upload", () => {
  const s = read(LIB);
  assert.match(s, /export function normalizeBrandKey\(value: string\): string/);
  assert.match(s, /export function brandKeyFromFilename\(name: string\): string/);
  assert.ok(s.includes('.replace(/[_-]+/g, " ")'));
  assert.match(s, /export function normalizeCategoryKey/);
});

test("v100 kompres client: crop persegi 1:1, resize 512, WEBP kualitas 0.8", () => {
  const s = read(CLIENT);
  assert.match(s, /"use client"/);
  assert.match(s, /export async function compressProductImage\(file: File\): Promise<File>/);
  assert.match(s, /PRODUCT_IMAGE_INPUT|MAX_PRODUCT_IMAGE_INPUT_BYTES/);
  assert.match(s, /PRODUCT_IMAGE_SIZE/);
  assert.match(s, /PRODUCT_IMAGE_QUALITY/);
  assert.match(s, /"image\/webp"/);
  assert.match(s, /imageSmoothingQuality = "high"|imageSmoothingQuality="high"/);
});

test("v100 API hanya admin: cek sesi + role di server", () => {
  const s = read(ROUTE);
  assert.match(s, /data: \{ user \},/);
  assert.match(s, /await supabase\.auth\.getUser\(\);/);
  assert.match(s, /if \(!user\) return \{ error: NextResponse\.json\(\{ message: "Silakan login kembali\." \}, \{ status: 401 \}\) \};/);
  assert.match(s, /!\["ADMIN", "SUPER_ADMIN"\]\.includes\(String\(profile\.role\)\)/);
  assert.match(s, /status: 403/);
  assert.match(s, /if \(auth\.error\) return auth\.error;/);
});

test("v100 GET: produk + brand otomatis dari ppob_services, gambar dipetakan per produk", () => {
  const s = read(ROUTE);
  assert.match(s, /const PAGE_SIZE = 1000;/);
  assert.match(s, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
  assert.match(s, /from\("ppob_services"\)\s*\n\s*\.select\("product_id,brand"\)/);
  assert.match(s, /from\("product_images"\)\s*\n\s*\.select\("product_id,image_url"\)/);
  assert.match(s, /from\("brand_media"\)\.select\("brand_key,brand_name,logo_url,updated_at"\)/);
  assert.match(s, /from\("category_media"\)\.select\("category_key,icon_url"\)/);
  assert.match(s, /image_url: imageByProduct\.get\(product\.id\) \|\| null,/);
  assert.match(s, /brand_logo_url: brandLogo,/);
  assert.match(s, /category_image_url:/);
});

test("v100 POST: batas 2MB, magic bytes, nama file UUID, bucket avatar, hapus file lama, audit", () => {
  const s = read(ROUTE);
  assert.match(s, /if \(file\.size > MAX_PRODUCT_IMAGE_INPUT_BYTES\)/);
  assert.match(s, /Ukuran gambar maksimal 2 MB\./);
  assert.match(s, /const realType = sniffProductImageType\(bytes\);/);
  assert.match(s, /Gambar harus berformat JPG, PNG, atau WEBP\./);
  assert.match(s, /const path = `products\/\$\{ref\}\/\$\{crypto\.randomUUID\(\)\}\.\$\{ext\}`;/);
  assert.match(s, /const path = `brands\/\$\{folder\}\/\$\{crypto\.randomUUID\(\)\}\.\$\{ext\}`;/);
  assert.match(s, /from\(PRODUCT_IMAGE_BUCKET\)\.upload\(path, bytes, \{/);
  assert.match(s, /cacheControl: "31536000"/);
  assert.match(s, /upsert: false/);
  assert.match(s, /\{ onConflict: "product_id" \}/);
  assert.match(s, /\{ onConflict: "brand_key" \}/);
  assert.match(s, /await removePublicFile\(admin, existing\?\.image_url, imageUrl\);/);
  assert.match(s, /await removePublicFile\(admin, mediaRow\?\.logo_url, imageUrl\);/);
  assert.match(s, /action: "productimage\.update"/);
  assert.match(s, /action: "brandmedia\.update"/);
  assert.match(s, /revalidatePath\("\/"\);/);
  // Tidak base64 / tidak tulis disk lokal
  assert.doesNotMatch(s, /writeFile|fs\.|base64/);
});

test("v100 POST: rollback file bila simpan DB gagal + pesan ramah migrasi", () => {
  const s = read(ROUTE);
  assert.match(s, /await admin\.storage\.from\(PRODUCT_IMAGE_BUCKET\)\.remove\(\[path\]\);/);
  assert.match(s, /Pastikan migrasi v100 sudah dijalankan\./);
});

test("v100 DELETE: gambar produk kembali ke brand, gambar brand dihapus + audit", () => {
  const s = read(ROUTE);
  assert.match(s, /export async function DELETE\(request: Request\)/);
  assert.match(s, /const scope = url\.searchParams\.get\("scope"\) \|\| "";/);
  assert.match(s, /from\("product_images"\)\.delete\(\)\.eq\("product_id", ref\)/);
  assert.match(s, /update\(\{ thumbnail_url: null, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(s, /action: "productimage\.reset"/);
  assert.match(s, /from\("brand_media"\)\.delete\(\)\.eq\("brand_key", brandKey\)/);
  assert.match(s, /action: "brandmedia\.delete"/);
  assert.match(s, /Produk kembali memakai gambar brand\./);
});

test("v100 ProductImage: next/image, placeholder blur, onError fallback ikon, tolak PDF", () => {
  const s = read(COMPONENT);
  assert.match(s, /import Image from "next\/image";/);
  assert.match(s, /placeholder="blur"/);
  assert.match(s, /blurDataURL=\{BLUR\}/);
  assert.match(s, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(s, /fallbackIcon = "bag"/);
  assert.match(s, /!\/\\\.pdf/);
  assert.match(s, /useEffect\(\(\) => setFailed\(false\), \[src\]\);/);
});

test("v100 panel admin Gambar Produk: tab, filter belum ada gambar, pratinjau, hapus, drag-drop", () => {
  assert.ok(exists(ADMIN_PAGE), ADMIN_PAGE);
  const p = read(ADMIN_PAGE);
  assert.match(p, /fetch\("\/api\/admin\/product-images"\)/);
  assert.match(p, /method: "POST", body/);
  assert.match(p, /method: "DELETE"/);
  assert.match(p, /useState<"products" \| "brands">\("products"\)/);
  assert.match(p, /Belum ada gambar/);
  assert.match(p, /Belum berlogo/);
  assert.match(p, /Ubah gambar/);
  assert.match(p, /Gunakan gambar brand/);
  assert.match(p, /capture="environment"/);
  assert.match(p, /accept=\{ACCEPT\}/);
  assert.match(p, /onDrop=/);
  assert.match(p, /Tarik beberapa logo ke sini/);
  assert.match(p, /brandKeyFromFilename\(file\.name\)/);
  assert.match(p, /compressProductImage\(file\)/);
  assert.match(p, /createPortal\(/);
  assert.match(p, /window\.confirm\(message\)/);
  assert.match(p, /const ACCEPT = "image\/png,image\/jpeg,image\/webp";/);
});

test("v100 panel Produk: kolom thumbnail, ubah gambar per baris, filter belum ada gambar", () => {
  const p = read(ADMIN_PRODUCTS);
  assert.match(p, /import ProductImage from "@\/components\/ProductImage";/);
  assert.match(p, /import \{ compressProductImage \} from "@\/lib\/product-image-client";/);
  assert.match(p, /from\("product_images"\)/);
  assert.match(p, /from\("brand_media"\)/);
  assert.match(p, /missingOnly/);
  assert.match(p, /Belum ada gambar/);
  assert.match(p, /Ubah gambar/);
  assert.match(p, /Gunakan gambar brand/);
  assert.match(p, /line-clamp-2 break-words/);
  assert.match(p, /const MAX_IMAGE_SIZE = 2 \* 1024 \* 1024;/);
});

test("v100 menu Gambar & Logo Brand di admin-menu, URL Logo Brand lama dialihkan", () => {
  assert.match(read(MENU), /href: "\/admin\/product-images", icon: "image", label: "Gambar & Logo Brand"/);
  assert.match(read('next.config.js'), /source: "\/admin\/brand-media", destination: "\/admin\/product-images\?tab=brand"/);
  assert.match(read('src/app/admin/product-images/page.tsx'), /tab.*brand|brand.*tab/);
});

test("v100 tampilan user: beranda, detail, checkout, favorit profil memakai gambar dengan fallback", () => {
  const home = read(HOME);
  assert.match(home, /import ProductImage from'@\/components\/ProductImage';/);
  assert.match(home, /from\('product_images'\)/);
  assert.match(home, /from\('ppob_services'\)/);
  assert.match(home, /from\('brand_media'\)/);
  assert.match(home, /p\.thumbnail_url\|\|/);

  const detail = read(DETAIL);
  assert.match(detail, /import ProductImage from "@\/components\/ProductImage";/);
  assert.match(detail, /priority/);
  assert.match(detail, /product\.thumbnail_url \|\|/);

  const checkout = read(CHECKOUT);
  assert.match(checkout, /import ProductImage from "@\/components\/ProductImage";/);
  assert.match(checkout, /setProductImage\(/);
  assert.match(checkout, /<ProductImage src=\{productImage\}/);

  const profile = read(PROFILE);
  assert.match(profile, /import ProductImage from'@\/components\/ProductImage';/);
  assert.match(profile, /loadFavoriteImages/);
  assert.match(profile, /product_favorites'\)\.select\('product_id,products\(id,name,slug,price,thumbnail_url,categories\(slug\)\)'\)/);
  assert.match(profile, /<ProductImage src=\{fi\[x\.product_id\]\|\|null\}/);
  assert.match(profile, /line-clamp-2 break-words/);
});

test("v100 PPOBServiceGrid: logo brand header + gambar baris 44px, checkout & grouping tidak berubah", () => {
  const g = read(GRID);
  assert.match(g, /from\("brand_media"\)/);
  assert.match(g, /from\("category_media"\)/);
  assert.match(g, /<ProductImage src=\{logoMap\[brand\.trim\(\)\.toLowerCase\(\)\]\}/);
  assert.match(g, /const rowImage = p\.thumbnail_url \|\| brandLogo \|\| categoryImage;/);
  assert.match(g, /h-11 w-11/);
  assert.match(g, /line-clamp-2 break-words/);
  assert.match(g, /\/checkout\?product=\$\{encodeURIComponent\(p\.id\)\}&qty=1/);
  assert.match(g, /groupByBrand\(filtered\)/);
});

test("v100 terdaftar di migration preflight", () => {
  const preflight = read("scripts/migration-preflight.mjs");
  assert.match(preflight, /97,98,99,100/);
  assert.match(preflight, /migrations_v100_product_images\.sql/);
  assert.match(preflight, /'product_images_select_all'/);
});
