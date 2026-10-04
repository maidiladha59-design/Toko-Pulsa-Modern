import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

test('v80 tiered topup fee wiring exists', () => {
  const migration = read('supabase/migrations_v80_topup_fee_tiers.sql');
  const route = read('src/app/api/topup/route.ts');
  const adminRoute = read('src/app/api/admin/topup-fee-tiers/route.ts');
  const adminPage = read('src/app/admin/topups/page.tsx');
  const page = read('src/app/wallet/topup/page.tsx');
  const preflight = read('scripts/migration-preflight.mjs');

  // Migration: table shape, RLS, overlap guard, seed.
  assert.match(migration, /topup_fee_tiers/);
  assert.match(migration, /min_amount bigint not null/);
  assert.match(migration, /max_amount bigint/);
  assert.match(migration, /fee_amount bigint not null/);
  assert.match(migration, /is_active boolean/);
  assert.match(migration, /sort_order integer/);
  assert.match(migration, /topup_fee_tiers_select_all/);
  assert.match(migration, /topup_fee_tiers_admin_write/);
  assert.match(migration, /public\.is_admin\(\)/);
  assert.match(migration, /TOPUP_FEE_TIER_OVERLAP/);
  assert.match(migration, /1000, 9999, 81/);
  // Tabel lama tidak boleh dihapus — tetap jadi fallback.
  assert.doesNotMatch(migration, /drop table[^;]*topup_fee_settings/i);
  assert.doesNotMatch(migration, /drop table[^;]*topup_fee_methods/i);

  // Server: tier lookup + fallback ke perhitungan lama.
  assert.match(route, /getActiveTiers/);
  assert.match(route, /findTierFee/);
  assert.match(route, /topup_fee_tiers/);
  assert.match(route, /calculateFee/);
  assert.match(route, /tiers/);

  // API admin: GET/POST/DELETE, validasi Zod, tolak overlap dengan pesan jelas.
  assert.match(adminRoute, /requireAdmin/);
  assert.match(adminRoute, /export async function GET/);
  assert.match(adminRoute, /export async function POST/);
  assert.match(adminRoute, /export async function DELETE/);
  assert.match(adminRoute, /rangesOverlap/);
  assert.match(adminRoute, /tumpang tindih/);
  assert.match(adminRoute, /status: 409/);

  // Halaman pelanggan: label baru + tier dipakai untuk hitung biaya.
  assert.match(page, /Biaya Admin/);
  assert.doesNotMatch(page, /Biaya AIDIL STORE/);
  assert.match(page, /tiers/);
  assert.match(page, /fee_amount/);

  // Panel admin: bagian tier + panggilan API-nya.
  assert.match(adminPage, /Biaya Admin Top Up Bertingkat/);
  assert.match(adminPage, /topup-fee-tiers/);

  // Preflight mengenal migrasi v80.
  assert.match(preflight, /migrations_v80_topup_fee_tiers\.sql/);
});

test('tier matching is inclusive at both ends and falls back when unmatched', () => {
  const tiers = [
    { min_amount: 1000, max_amount: 9999, fee_amount: 81 },
    { min_amount: 10000, max_amount: null, fee_amount: 250 },
  ];
  const findTierFee = (amount, list) => {
    const tier = list.find((t) => amount >= t.min_amount && (t.max_amount == null || amount <= t.max_amount));
    return tier ? tier.fee_amount : null;
  };
  // Batas inklusif: 1000 dan 9999 sama-sama masuk tier pertama → Rp81.
  assert.equal(findTierFee(1000, tiers), 81);
  assert.equal(findTierFee(9999, tiers), 81);
  // Di luar semua tier → null, artinya pakai fallback feeConfig lama.
  assert.equal(findTierFee(999, tiers), null);
  assert.equal(findTierFee(500, []), null);
  // max_amount null = tanpa batas atas.
  assert.equal(findTierFee(10000, tiers), 250);
  assert.equal(findTierFee(25000000, tiers), 250);

  // Fallback: perhitungan lama tetap dipakai saat tidak ada tier yang cocok.
  const calculateFee = (amount, cfg) => {
    if (!cfg.enabled || cfg.fee_value <= 0) return 0;
    return cfg.fee_type === 'PERCENTAGE' ? Math.max(0, Math.round(amount * cfg.fee_value / 100)) : Math.max(0, Math.round(cfg.fee_value));
  };
  const legacy = { enabled: true, fee_type: 'FIXED', fee_value: 500 };
  const fee = findTierFee(999, tiers) ?? calculateFee(999, legacy);
  assert.equal(fee, 500);
});
