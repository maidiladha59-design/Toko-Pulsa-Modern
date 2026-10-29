import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MIGRATION = 'supabase/migrations_v89_business_profile.sql';

test('v89 migrasi business_profile: single-row, kolom lengkap, seed, baca publik', () => {
  assert.ok(fs.existsSync(path.join(root, MIGRATION)), 'migrasi v89 harus ada');
  const sql = read(MIGRATION).toLowerCase();
  assert.match(sql, /create table if not exists public\.business_profile/);
  assert.match(sql, /id boolean primary key default true check \(id\)/);
  for (const col of [
    'business_name',
    'owner_name',
    'business_address',
    'business_phone',
    'business_email',
    'nib_number',
    'pse_status',
    'pse_registration_number',
    'logo_url',
    'legal_document_url',
    'show_legal_document_publicly',
    'updated_at',
    'updated_by uuid references auth\\.users\\(id\\)',
  ]) {
    assert.match(sql, new RegExp(col), `kolom ${col} harus ada`);
  }
  assert.match(sql, /pse_status in \('belum_terdaftar', 'dalam_proses', 'terdaftar'\)/);
  assert.match(sql, /insert into public\.business_profile \(id\) values \(true\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /create policy "business_profile_public_read"/);
  assert.match(sql, /for select to anon, authenticated using \(id = true\)/);
  assert.match(sql, /revoke all on public\.business_profile from public, anon, authenticated/);
  assert.doesNotMatch(sql, /create policy "business_profile_(admin|write)/, 'tidak boleh ada policy tulis langsung');
});

test('v89 storage business-assets: bucket publik, baca publik, tulis admin', () => {
  const sql = read(MIGRATION).toLowerCase();
  assert.match(sql, /values \('business-assets', 'business-assets', true\)/);
  assert.match(sql, /create policy "business_assets_public_read" on storage\.objects/);
  assert.match(sql, /for select using \(bucket_id = 'business-assets'\)/);
  assert.match(sql, /create policy "business_assets_admin_insert" on storage\.objects/);
  assert.match(sql, /create policy "business_assets_admin_update" on storage\.objects/);
  assert.match(sql, /create policy "business_assets_admin_delete" on storage\.objects/);
  assert.match(sql, /bucket_id = 'business-assets' and public\.is_admin_or_staff\(\)/);
});

test('v89 RPC admin_update_business_profile: cek role, validasi PSE, audit', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /create or replace function public\.admin_update_business_profile\(\s*p_admin_id uuid,\s*p_data jsonb\s*\)/);
  assert.match(sql, /if auth\.uid\(\) is null then\s*raise exception 'UNAUTHENTICATED'/);
  assert.match(sql, /p_admin_id <> auth\.uid\(\)/);
  assert.match(sql, /v_role not in \('SUPER_ADMIN', 'ADMIN', 'STAFF'\)/);
  assert.match(sql, /PSE_NUMBER_REQUIRED/);
  assert.match(sql, /LEGAL_DOCUMENT_REQUIRED/);
  assert.match(sql, /v_pse_status not in \('BELUM_TERDAFTAR', 'DALAM_PROSES', 'TERDAFTAR'\)/);
  assert.match(sql, /insert into public\.audit_logs/);
  assert.match(sql, /'business_profile\.update'/);
  assert.match(sql, /grant execute on function public\.admin_update_business_profile\(uuid, jsonb\) to authenticated, service_role/);
});

test('v89 preflight mendaftarkan migrasi dan definisi wajib', () => {
  const script = read('scripts/migration-preflight.mjs');
  assert.match(script, /migrations_v89_business_profile\.sql/);
  assert.match(script, /88,89,90,93,94,97,98,99]/);
  assert.match(script, /admin_update_business_profile/);
  assert.match(script, /business-assets/);
});

test('v89 API admin memakai RPC session + upload tervalidasi', () => {
  const api = read('src/app/api/admin/business-profile/route.ts');
  assert.match(api, /createClient\(\)/);
  assert.match(api, /\.rpc\("admin_update_business_profile"/);
  assert.match(api, /p_admin_id: auth\.user!\.id/);
  assert.match(api, /pse_status: z\.enum\(\["BELUM_TERDAFTAR", "DALAM_PROSES", "TERDAFTAR"\]\)/);
  assert.match(api, /Nomor registrasi PSE wajib diisi saat status Terdaftar/);

  const upload = read('src/app/api/admin/business-profile/upload/route.ts');
  assert.match(upload, /const MAX_SIZE = 5 \* 1024 \* 1024/);
  assert.match(upload, /application\/pdf/);
  assert.match(upload, /from\("business-assets"\)\.upload/);
  assert.match(upload, /getPublicUrl/);
  assert.match(upload, /\[\"ADMIN\", \"SUPER_ADMIN\"\]\.includes/);
});

test('v89 halaman admin identitas usaha lengkap + menu sidebar', () => {
  const page = read('src/app/admin/identitas-usaha/page.tsx');
  for (const field of [
    'business_name',
    'owner_name',
    'business_address',
    'business_phone',
    'business_email',
    'nib_number',
    'pse_status',
    'pse_registration_number',
    'logo_url',
    'legal_document_url',
    'show_legal_document_publicly',
  ]) {
    assert.match(page, new RegExp(field), `field ${field} harus ada di form`);
  }
  assert.match(page, /Upload Logo/);
  assert.match(page, /Pratinjau lokal/);
  assert.match(page, /Ganti Dokumen/);
  assert.match(page, /Tampilkan tautan dokumen legal ini di halaman Identitas Usaha publik/);
  assert.match(page, /\/api\/admin\/business-profile\/upload/);

  const sidebar = read('src/app/admin/AdminSidebar.tsx');
  assert.match(sidebar, /\["\/admin\/identitas-usaha", "office", "Identitas Usaha"\]/);
});

test('v89 UI publik dinamis: badge PSE 3 status, pemilik, logo, dokumen legal', () => {
  const card = read('src/components/BusinessIdentityCard.tsx');
  assert.match(card, /const biz = await getBusinessIdentity\(\)/);
  assert.match(card, /Terdaftar PSE/);
  assert.match(card, /Pendaftaran PSE dalam proses/);
  assert.match(card, /Status pendaftaran PSE belum diisi/);
  assert.match(card, /biz\.ownerName/);
  assert.match(card, /biz\.logoUrl/);
  assert.match(card, /biz\.showLegalDocumentPublicly && biz\.legalDocumentUrl/);
  assert.match(card, /Lihat dokumen legal/);

  const home = read('src/app/page.tsx');
  assert.match(home, /<BusinessIdentityCard compact \/>/);
  const identityPage = read('src/app/identitas-usaha/page.tsx');
  assert.match(identityPage, /<BusinessIdentityCard \/>/);
});

test('v89 lib bisnis membaca DB dengan fallback env dan memetakan status PSE', () => {
  const lib = read('src/lib/business.ts');
  assert.match(lib, /from\("business_profile"\)/);
  assert.match(lib, /TERDAFTAR: "REGISTERED"/);
  assert.match(lib, /DALAM_PROSES: "PENDING"/);
  assert.match(lib, /BELUM_TERDAFTAR: "NOT_SET"/);
  assert.match(lib, /process\.env\.NEXT_PUBLIC_BUSINESS_LEGAL_NAME/);
  assert.match(lib, /catch \{\s*return fallback;/);
  assert.match(lib, /export async function getBusinessIdentity\(\): Promise<BusinessIdentity>/);
});
