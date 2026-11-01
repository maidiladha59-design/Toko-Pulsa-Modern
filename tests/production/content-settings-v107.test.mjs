import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

const MIGRATION = "supabase/migrations_v107_content_settings.sql";
const PAGES_LIB = "src/lib/pages-settings.ts";
const PAGES_VIEW = "src/components/StaticPageView.tsx";
const PAGES_ROUTE = "src/app/halaman/[slug]/page.tsx";
const LEVEL_LIB = "src/lib/level-kyc-settings.ts";
const LEVEL_TIERS = "src/lib/level-tiers.ts";
const KYC_SERVER = "src/lib/kyc-limits-server.ts";
const NOTIF_LIB = "src/lib/notification-templates.ts";
const NOTIF_ENGINE = "src/lib/notification-engine.ts";
const NOTIF_TEST_API = "src/app/api/admin/notification-templates/test/route.ts";
const OPERATOR_LIB = "src/lib/operator-settings.ts";
const OPERATOR_API = "src/app/api/public/operators/route.ts";
const CHECKOUT = "src/app/checkout/page.tsx";
const REGISTRY = "src/lib/managed-settings.ts";
const MENU = "src/lib/admin-menu.ts";
const PREFLIGHT = "scripts/migration-preflight.mjs";

const ADMIN_PAGES = {
  "Teks & Halaman": ["src/app/admin/teks-halaman/page.tsx", "PAGES_SETTINGS_KEY", "pagesValidate"],
  "Level & KYC": ["src/app/admin/level-kyc/page.tsx", "LEVEL_KYC_SETTINGS_KEY", "levelKycValidate"],
  "Template Notifikasi": [
    "src/app/admin/template-notifikasi/page.tsx",
    "NOTIFICATION_TEMPLATES_SETTINGS_KEY",
    "notificationTemplatesValidate",
  ],
  "Pengaturan Operator": ["src/app/admin/operator/page.tsx", "OPERATOR_SETTINGS_KEY", "operatorSettingsValidate"],
};

test("v107 migrasi: empat kunci baru, hanya tiga kunci dibaca publik", () => {
  assert.ok(exists(MIGRATION), "file migrasi v107 harus ada");
  const sql = read(MIGRATION);

  const start = sql.indexOf('create policy "site_settings_public_read"');
  assert.ok(start >= 0, "policy baca publik harus dibuat ulang");
  const policy = sql.slice(start, sql.indexOf("-- =", start));
  for (const key of ["pages_settings", "level_kyc_settings", "operator_settings"]) {
    assert.match(policy, new RegExp(`'${key}'`));
  }
  assert.doesNotMatch(policy, /'notification_templates'/, "template notifikasi tidak boleh dibaca publik");

  assert.match(
    sql,
    /values\s+\('pages_settings', '\{\}'::jsonb\),\s+\('level_kyc_settings', '\{\}'::jsonb\),\s+\('notification_templates', '\{\}'::jsonb\),\s+\('operator_settings', '\{\}'::jsonb\)/
  );
  assert.match(sql, /on conflict \(key\) do nothing;/);

  // Tidak menyentuh tabel transaksi/saldo mana pun.
  assert.doesNotMatch(
    sql,
    /(insert into|update|alter table)\s+public\.(wallets|orders|topups|transactions|financial_ledger|wallet_transfers)/i
  );
});

test("v107 preflight mengenal migrasi dan urutan wajib berakhir di 107", () => {
  const script = read(PREFLIGHT);
  assert.match(script, /migrations_v107_content_settings\.sql/);
  assert.match(script, /'pages_settings'/);
  assert.match(script, /'notification_templates'/);
  assert.match(script, /105,106,107,108,109\]/);
});

test("v107 halaman statis: JSON blok, render aman, rute publik fallback default", () => {
  const lib = read(PAGES_LIB);
  assert.match(lib, /export const PAGES_SETTINGS_KEY = "pages_settings";/);
  for (const slug of ["syarat-ketentuan", "kebijakan-privasi", "tentang-kami", "kontak"]) {
    assert.match(lib, new RegExp(`"${slug}"`));
  }
  assert.match(lib, /\{ type: "list"; items: string\[\] \}/);
  assert.match(lib, /\{ type: "link"; text: string; href: string \}/);
  assert.match(lib, /export function safeLinkHref/);
  assert.match(lib, /isInternalPathOrHttps/);
  assert.match(lib, /export function pageFor/);
  assert.match(lib, /export function pagesValidate/);
  assert.match(lib, /export function whatsappHref/);
  assert.doesNotMatch(lib, /dangerouslySetInnerHTML/);

  const view = read(PAGES_VIEW);
  assert.doesNotMatch(view, /dangerouslySetInnerHTML=/);
  assert.match(view, /target="_blank" rel="noopener noreferrer"/);
  assert.match(view, /block\.type === "heading"/);
  assert.match(view, /block\.type === "list"/);
  assert.match(view, /whatsappHref/);
  assert.match(view, /<ContactPanel contact=\{contact\} \/>/);

  const route = read(PAGES_ROUTE);
  assert.match(route, /getSetting<PagesSettings>\(PAGES_SETTINGS_KEY, DEFAULT_PAGES_SETTINGS\)/);
  assert.match(route, /pageFor\(settings, slug\)/);
  assert.match(route, /params\.slug === "kontak"/);
  assert.match(route, /export async function generateMetadata/);
  assert.match(route, /notFound\(\)/);

  assert.match(read("src/lib/supabase/middleware.ts"), /"\/halaman"/);
});

test("v107 level & KYC: urutan level divalidasi dan batas ditegakkan di server", () => {
  const lib = read(LEVEL_LIB);
  assert.match(lib, /export const LEVEL_KYC_SETTINGS_KEY = "level_kyc_settings";/);
  for (const key of ["maxTopupPerTx", "maxTopupPerDay", "maxTransferPerTx", "maxTransferPerDay", "maxPurchasePerDay"]) {
    assert.match(lib, new RegExp(`"${key}"`));
  }
  assert.match(lib, /Level pertama harus dimulai dari 0 transaksi\./);
  assert.match(lib, /harus lebih besar dari level sebelumnya/);
  assert.match(lib, /rainbowRingVerifiedOnly: true/);
  assert.match(lib, /verificationHint:/);
  assert.match(lib, /export function limitsForStatus/);
  assert.match(lib, /export function limitExceeded/);
  assert.match(lib, /export function levelKycPublishError/);

  const tiers = read(LEVEL_TIERS);
  assert.doesNotMatch(tiers, /from "zod"/, "helper level untuk client tidak boleh menyeret zod");

  const server = read(KYC_SERVER);
  assert.match(server, /getSetting\(LEVEL_KYC_SETTINGS_KEY, DEFAULT_LEVEL_KYC_SETTINGS\)/);
  assert.match(server, /limitsForStatus\(settings, status\)/);
  assert.match(server, /export function wibDayStartIso/);
  assert.match(server, /Batas \$\{label\} harian Anda/);
  assert.match(server, /Verifikasi akun untuk menaikkan batas\./);
  assert.match(server, /status: 403/);
  assert.doesNotMatch(server, /admin\.rpc\(/, "penegakan batas tidak boleh memanggil RPC saldo");

  for (const file of [
    "src/app/api/topup/route.ts",
    "src/app/api/transfer/route.ts",
    "src/app/api/checkout/route.ts",
    "src/app/api/ppob/prepaid/pay/route.ts",
    "src/app/api/ppob/postpaid/pay/route.ts",
  ]) {
    const route = read(file);
    assert.match(route, /checkKycLimit/, `${file} harus memakai checkKycLimit`);
  }
});

test("v107 template notifikasi: daftar putih variabel, istilah internal, fallback teks lama", () => {
  const lib = read(NOTIF_LIB);
  assert.match(lib, /export const NOTIFICATION_TEMPLATES_SETTINGS_KEY = "notification_templates";/);
  for (const key of ["nama", "produk", "nominal", "tujuan", "invoice", "saldo", "tanggal", "alasan"]) {
    assert.match(lib, new RegExp(`key: "${key}"`));
  }
  for (const event of [
    "TRANSACTION_SUCCESS",
    "TRANSACTION_PROCESSING",
    "TRANSACTION_FAILED",
    "TRANSACTION_REFUND",
    "TOPUP_SUCCESS",
    "TOPUP_FAILED",
    "KYC_APPROVED",
    "KYC_REJECTED",
    "TRANSFER_RECEIVED",
  ]) {
    assert.match(lib, new RegExp(`eventKey: "${event}"`));
  }
  assert.match(lib, /export function unknownTemplateVariables/);
  assert.match(lib, /export function forbiddenTemplateTerms/);
  assert.match(lib, /const FORBIDDEN_TERMS = \["COMPLETED", "PENDING", "MIDTRANS"/);
  assert.match(lib, /export function renderNotificationTemplate/);
  assert.match(lib, /export function notificationTemplatesPublishError/);
  assert.match(lib, /export function sampleTemplateVariables/);

  const engine = read(NOTIF_ENGINE);
  assert.match(engine, /getAdminSetting\(NOTIFICATION_TEMPLATES_SETTINGS_KEY, DEFAULT_NOTIFICATION_TEMPLATES\)/);
  assert.match(engine, /const settingsTemplate = templateForEvent\(settings, input\.eventKey\)/);
  assert.match(engine, /reason: 'template_disabled'/);
  assert.match(engine, /title = render\(dbTemplate\.title, vars\)/, "teks lama tetap dipakai saat template tidak aktif");

  const api = read(NOTIF_TEST_API);
  assert.match(api, /can_admin_permission/);
  assert.match(api, /p_permission: "platform\.manage"/);
  assert.match(api, /unknownTemplateVariables/);
  assert.match(api, /createAdminClient\(\)\.from\("notifications"\)\.insert/);
  assert.match(api, /recordSettingAudit\(user\.id, "settings\.notification_template_test"/);
});

test("v107 operator: peta prefix, peringatan ganda, dan fallback bawaan", () => {
  const lib = read(OPERATOR_LIB);
  assert.match(lib, /export const OPERATOR_SETTINGS_KEY = "operator_settings";/);
  assert.match(lib, /regex\(\/\^0\\d\{3\}\$\//);
  assert.match(lib, /export function parsePrefixInput/);
  assert.match(lib, /export function detectOperatorEntry/);
  assert.match(lib, /export function duplicatePrefixes/);
  assert.match(lib, /export function operatorSettingsValidate/);
  assert.match(lib, /prefixes: \["0851"\]/, "by.U 0851 ada di peta bawaan");

  const api = read(OPERATOR_API);
  assert.match(api, /getSetting<OperatorSettings>\(OPERATOR_SETTINGS_KEY, DEFAULT_OPERATOR_SETTINGS\)/);

  const checkout = read(CHECKOUT);
  assert.match(checkout, /fetch\("\/api\/public\/operators"\)/);
  assert.match(checkout, /schemaFields: ppob\.target_schema\?\.fields \|\| null, operators \}\)/);
});

test("v107 empat halaman admin memakai SettingsForm, registry, dan menu Tampilan", () => {
  const menu = read(MENU);
  for (const [label, [file, keyRef, validateRef]] of Object.entries(ADMIN_PAGES)) {
    assert.ok(exists(file), `${file} harus ada`);
    const page = read(file);
    assert.match(page, /"use client";/);
    assert.match(page, new RegExp(`settingKey=\\{${keyRef}\\}`));
    assert.match(page, new RegExp(`validate=\\{${validateRef}\\}`));
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    assert.match(menu, new RegExp(`label: "${label}"`));
  }
  assert.match(read("src/app/admin/template-notifikasi/page.tsx"), /Kirim uji ke akun saya/);
  assert.match(read("src/app/admin/template-notifikasi/page.tsx"), /fetch\("\/api\/admin\/notification-templates\/test"/);
  assert.match(read("src/app/admin/operator/page.tsx"), /duplicatePrefixes\(value\)/);
  assert.match(read("src/app/admin/level-kyc/page.tsx"), /KYC_LIMIT_FIELDS\.map/);

  const reg = read(REGISTRY);
  for (const key of ["pages_settings:", "level_kyc_settings:", "notification_templates:", "operator_settings:"]) {
    assert.match(reg, new RegExp(`${key} \\{`));
  }
  assert.match(reg, /validatePublish: notificationTemplatesPublishError/);
  assert.match(reg, /publicRead: false/);
});

test("v107 tidak menyentuh API transaksi di luar pengecekan batas", () => {
  for (const file of [
    "src/app/api/midtrans/webhook/route.ts",
    "src/app/api/wallet/route.ts",
    "src/lib/midtrans.ts",
  ]) {
    if (!exists(file)) continue;
    const source = read(file);
    assert.doesNotMatch(source, /notification_templates|operator_settings|pages_settings|level_kyc_settings/);
  }
  for (const file of [PAGES_LIB, LEVEL_LIB, NOTIF_LIB, OPERATOR_LIB, KYC_SERVER, ...Object.values(ADMIN_PAGES).map(([f]) => f)]) {
    assert.doesNotMatch(read(file), /MIDTRANS_(SERVER|CLIENT)_KEY\s*=\s*["'`]/, "tidak ada kunci rahasia hardcoded");
  }
});
