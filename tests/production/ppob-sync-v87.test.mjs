import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

test('v87 sinkronisasi memproses seluruh respons prepaid dan pasca tanpa dipotong', () => {
  const route = read('src/app/api/admin/ppob/pricelist/route.ts');
  // Kedua cmd Dipiflazz dipanggil dan digabung.
  assert.match(route, /getPrepaidPriceList\(\)/);
  assert.match(route, /getPostpaidPriceList\(\)/);
  assert.match(route, /serviceKind: "prepaid"/);
  assert.match(route, /serviceKind: "postpaid"/);
  // Respons bukan array tidak boleh dianggap "0 SKU" (kegagalan provider terlihat jelas).
  assert.match(route, /Array\.isArray\(prepaid\?\.data\)/);
  assert.match(route, /DIGIFLAZZ_RESPONSE_INVALID/);
  // Tidak ada pemotongan data provider (slice/limit/take pada array hasil).
  assert.doesNotMatch(route, /\.(data|rows|prepared)\.slice\(/);
  assert.doesNotMatch(route, /\.limit\(\d+\)/);
});

test('v87 upsert per-batch, bukan query satu-per-satu per SKU', () => {
  const route = read('src/app/api/admin/ppob/pricelist/route.ts');
  assert.match(route, /const UPSERT_BATCH = 250;/);
  assert.match(route, /function chunk/);
  // Produk batched dengan kunci slug; layanan dengan kunci provider,provider_sku.
  assert.match(route, /from\("products"\)\.upsert\(payloads, \{ onConflict: "slug" \}\)/);
  assert.match(route, /from\("ppob_services"\)\.upsert\(payloads, \{ onConflict: "provider,provider_sku" \}\)/);
  // Pola lama (select produk per slug di dalam loop) tidak boleh kembali.
  assert.doesNotMatch(route, /from\("products"\)\.select\("id"\)\.eq\("slug", productSlug\)/);
  // Batch yang gagal diulang satu-per-satu supaya baris sehat tetap masuk.
  assert.match(route, /upsert\(\[p\.product\], \{ onConflict: "slug" \}\)/);
  // Daftar slug lama diambil dengan paginasi (batas 1000 baris PostgREST).
  assert.match(route, /\.range\(offset, offset \+ SELECT_PAGE - 1\)/);
});

test('v87 setiap SKU yang dilewati tercatat alasannya + kategori fallback dihitung', () => {
  const route = read('src/app/api/admin/ppob/pricelist/route.ts');
  for (const reason of ['invalid_data', 'price_zero', 'duplicate_sku', 'slug_collision', 'product_upsert_error', 'service_upsert_error']) {
    assert.ok(route.includes(`"${reason}"`), `alasan skip ${reason} harus ada`);
  }
  assert.match(route, /function skip\(reason: SkipReason, sku: string\)/);
  assert.match(route, /skippedSamples/);
  // Kategori tidak dikenal tetap disimpan (fallback), tidak dibuang diam-diam.
  assert.match(route, /const FALLBACK_CATEGORY = "tagihan-lainnya";/);
  assert.match(route, /fallbackCategoryCount\+\+/);
  assert.match(route, /fallbackCategories\.add\(rawCategory\)/);
  // Ringkasan lengkap dikirim balik ke panel admin.
  assert.match(route, /skippedReasons,/);
  assert.match(route, /fallbackCategory: \{ count: fallbackCategoryCount/);
  assert.match(route, /saved: summary\.created \+ summary\.updated/);
});

test('v87 progres sinkronisasi dipersist agar terpotong timeout tetap terlihat', () => {
  const route = read('src/app/api/admin/ppob/pricelist/route.ts');
  assert.match(route, /async function persistProgress/);
  assert.match(route, /payload\.processed_count = processedSoFar/);
  assert.match(route, /persistProgress\("RUNNING", handled\)/);
  assert.match(route, /persistProgress\("SUCCESS", summary\.processed\)/);
  assert.match(route, /persistProgress\("FAILED", summary\.processed/);
  // Kode tetap berfungsi walau migrasi v87 belum dijalankan.
  assert.match(route, /logHasV87 = false/);
});

test('v87 pricing engine lama tidak berubah (pin v37 tetap berlaku)', () => {
  const route = read('src/app/api/admin/ppob/pricelist/route.ts');
  assert.match(route, /resolvePricingRule/);
  assert.match(route, /aidilFee/);
  assert.match(route, /pricing_rule_id: resolved\.rule\?\.id \|\| null/);
  assert.match(route, /pricing_rule_id/);
  // Logika inquiry pasca tidak disentuh.
  const inquiry = read('src/app/api/ppob/inquiry/route.ts');
  assert.match(inquiry, /aidil_fee/);
  assert.match(inquiry, /resolvePricingRule/);
});

test('v87 migrasi menambah kolom progres tanpa mengubah skema lama', () => {
  const sql = read('supabase/migrations_v87_ppob_sync_details.sql').toLowerCase();
  assert.match(sql, /ppob_provider_syncs/);
  assert.match(sql, /add column if not exists processed_count integer not null default 0/);
  assert.match(sql, /add column if not exists details jsonb/);
  assert.doesNotMatch(sql, /create table/);
  assert.doesNotMatch(sql, /drop table/);
  assert.doesNotMatch(sql, /drop column/);
  assert.doesNotMatch(sql, /alter column/);
  const script = read('scripts/migration-preflight.mjs');
  assert.match(script, /migrations_v87_ppob_sync_details\.sql/);
  assert.match(script, /86,87,88,89,90,93,94,97,98]/);
});

test('v87 halaman admin menampilkan ringkasan masuk vs dilewati beserta alasan', () => {
  const page = read('src/app/admin/ppob/page.tsx');
  assert.match(page, /Ringkasan Sinkronisasi/);
  assert.match(page, /SKU yang dilewati beserta alasannya/);
  assert.match(page, /SKIP_LABELS/);
  assert.match(page, /skippedSamples/);
  assert.match(page, /fallbackCategory/);
  assert.match(page, /masuk kategori fallback/);
  // Toast memuat angka lengkap, bukan sekadar "selesai".
  assert.match(page, /SKU tersimpan \(\$\{data\.created\} baru, \$\{data\.updated\} diperbarui\), \$\{data\.skipped\} dilewati/);
  // Kegagalan parsial menampilkan berapa banyak sudah diproses.
  assert.match(page, /SKU diproses sebelum gagal/);
});
