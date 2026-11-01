import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const LIB = "src/lib/admin-export.ts";
const SERVER = "src/lib/admin-export-server.ts";
const ROUTE = "src/app/api/admin/export/[kind]/route.ts";
const FINANCE_ALIAS = "src/app/api/admin/finance/export/route.ts";
const PANEL = "src/components/ExportCsvPanel.tsx";
const MIGRATION = "supabase/migrations_v108_admin_export.sql";
const PREFLIGHT = "scripts/migration-preflight.mjs";

const ADMIN_PAGES = {
  orders: "src/app/admin/orders/page.tsx",
  users: "src/app/admin/users/page.tsx",
  topups: "src/app/admin/topups/page.tsx",
  finance: "src/app/admin/finance/page.tsx",
};

async function loadExportLib() {
  const source = read(LIB);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

test("v108 migrasi hanya menambah permission export dan terdaftar di preflight", () => {
  const sql = read(MIGRATION);
  assert.match(sql, /insert into public\.admin_role_permissions \(role, permission, enabled\)/);
  assert.match(sql, /\('ADMIN', 'export', true\)/);
  assert.match(sql, /\('SUPER_ADMIN', 'export', true\)/);
  assert.match(sql, /on conflict \(role, permission\) do nothing/);
  assert.match(sql, /audit_logs/);
  assert.doesNotMatch(sql, /create table/i);
  assert.doesNotMatch(sql, /alter table/i);
  assert.doesNotMatch(sql, /drop /i);

  const preflight = read(PREFLIGHT);
  assert.match(preflight, /migrations_v108_admin_export\.sql/);
  assert.match(preflight, /105,106,107,108,109]/);
});

test("v108 rentang tanggal wajib, format WIB, dan maksimal 31 hari", async () => {
  const lib = await loadExportLib();
  assert.equal(lib.EXPORT_MAX_DAYS, 31);
  assert.equal(lib.EXPORT_MAX_ROWS, 50000);
  assert.equal(lib.EXPORT_BATCH_SIZE, 1000);

  assert.equal(lib.parseExportRange(null, "2026-11-01").ok, false);
  assert.match(lib.parseExportRange(null, "2026-11-01").message, /wajib dipilih/);
  assert.match(lib.parseExportRange("2026-02-30", "2026-03-01").message, /tidak valid/);
  assert.match(lib.parseExportRange("2026-11-02", "2026-11-01").message, /sebelum atau sama/);

  const full = lib.parseExportRange("2026-10-01", "2026-10-31");
  assert.equal(full.ok, true);
  assert.equal(full.days, 31);
  assert.equal(full.startIso, "2026-09-30T17:00:00.000Z");
  assert.equal(full.endIso, "2026-10-31T16:59:59.999Z");

  const tooLong = lib.parseExportRange("2026-10-01", "2026-11-01");
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /maksimal 31 hari/);

  assert.deepEqual(lib.defaultExportRange(new Date("2026-11-01T06:00:00Z")), {
    from: "2026-10-26",
    to: "2026-11-01",
  });
});

test("v108 tanggal ditulis 2026-11-01 13:55 WIB", async () => {
  const lib = await loadExportLib();
  assert.equal(lib.formatWibDateTime("2026-11-01T06:55:00.000Z"), "2026-11-01 13:55 WIB");
  assert.equal(lib.formatWibDateTime("2026-10-31T17:30:00.000Z"), "2026-11-01 00:30 WIB");
  assert.equal(lib.formatWibDateTime(null), "");
  assert.equal(lib.formatWibDateTime("bukan tanggal"), "");
});

test("v108 sel CSV: koma, kutip, baris baru, dan injeksi formula", async () => {
  const lib = await loadExportLib();
  assert.equal(lib.csvCell("a,b"), '"a,b"');
  assert.equal(lib.csvCell('a"b'), '"a""b"');
  assert.equal(lib.csvCell("baris\nbaru"), '"baris\nbaru"');
  assert.equal(lib.csvCell("=1+1"), "'=1+1");
  assert.equal(lib.csvCell("+62 812"), "'+62 812");
  assert.equal(lib.csvCell("-5"), "'-5");
  assert.equal(lib.csvCell("@cmd"), "'@cmd");
  assert.equal(lib.csvCell("=a,b"), '"\'=a,b"');
  assert.equal(lib.csvCell("teks biasa"), "teks biasa");
  assert.equal(lib.csvCell(null), "");

  assert.equal(lib.csvNumber(1_250_000), "1250000");
  assert.equal(lib.csvNumber("50000"), "50000");
  assert.equal(lib.csvNumber(null), "");

  const columns = [
    { header: "Nama", value: (row) => row.name },
    { header: "Total (Rp)", value: (row) => row.total, numeric: true },
  ];
  assert.equal(lib.csvHeader(columns), "Nama,Total (Rp)");
  assert.equal(lib.csvLine({ name: "=x", total: "2500" }, columns), "'=x,2500");
});

test("v108 kolom berlabel Indonesia, rupiah murni, dan tanpa data sensitif", async () => {
  const lib = await loadExportLib();
  const orders = lib.exportColumns("orders").map((column) => column.header);
  const users = lib.exportColumns("users").map((column) => column.header);
  const topups = lib.exportColumns("topups").map((column) => column.header);
  const finance = lib.exportColumns("finance").map((column) => column.header);

  assert.deepEqual(orders, [
    "Nomor Pesanan",
    "Nama Pelanggan",
    "Email Pelanggan",
    "Metode Pembayaran",
    "Total (Rp)",
    "Status",
    "Waktu Dibuat",
  ]);
  assert.ok(users.includes("ID Pengguna"));
  assert.ok(users.includes("Saldo (Rp)"));
  assert.ok(users.includes("Tanggal Bergabung"));
  assert.ok(topups.includes("Total Dibayar (Rp)"));
  assert.ok(topups.includes("Biaya Gateway (Rp)"));
  assert.ok(finance.includes("Profit Bersih (Rp)"));
  assert.ok(finance.includes("Waktu"));

  for (const columns of [orders, users, topups, finance]) {
    const text = columns.join(" ").toLowerCase();
    for (const forbidden of ["password", "token", "pin", "nik", "ktp", "kartu", "metadata"]) {
      assert.ok(!text.includes(forbidden), `kolom ${forbidden} tidak boleh ada`);
    }
  }

  const moneyColumns = [
    ...lib.exportColumns("orders"),
    ...lib.exportColumns("users"),
    ...lib.exportColumns("topups"),
    ...lib.exportColumns("finance"),
  ].filter((column) => column.header.includes("(Rp)"));
  assert.ok(moneyColumns.length >= 8);
  for (const column of moneyColumns) assert.equal(column.numeric, true);

  const source = read(LIB);
  const columnsBlock = source.slice(source.indexOf("export const EXPORT_COLUMNS"), source.indexOf("export function exportColumns"));
  assert.doesNotMatch(columnsBlock, /password|pin_hash|token|nik|ktp|card_number|metadata/i);
});

test("v108 nama file dan pesan batas baris jelas", async () => {
  const lib = await loadExportLib();
  assert.equal(
    lib.exportFilename("topups", "2026-10-26", "2026-11-01"),
    "aidil-store-top-up-2026-10-26-2026-11-01.csv"
  );
  assert.equal(
    lib.exportFilename("finance", "2026-10-26", "2026-11-01"),
    "aidil-store-keuangan-2026-10-26-2026-11-01.csv"
  );
  const message = lib.exportRowLimitMessage(60000);
  assert.match(message, /50\.000 baris/);
  assert.match(message, /60\.000 baris/);
  assert.match(message, /Persempit rentang tanggal/);
});

test("v108 route streaming: izin export, audit, batas baris, BOM", () => {
  const server = read(SERVER);
  const route = read(ROUTE);

  assert.match(server, /can_admin_permission/);
  assert.match(server, /p_permission: EXPORT_PERMISSION/);
  assert.match(server, /EXPORT_PAGE_PERMISSIONS\[kind\]/);
  assert.match(server, /action: "admin\.export"/);
  assert.match(server, /target_type: "export"/);
  assert.match(server, /row_count: rowCount/);
  assert.match(server, /search: filters\.q \|\| null/);
  assert.match(server, /status: filters\.status \|\| null/);
  assert.match(server, /audit_logs/);

  assert.match(server, /count: "exact", head: true/);
  assert.match(server, /total > EXPORT_MAX_ROWS/);
  assert.match(server, /exportRowLimitMessage\(total\), 413/);
  assert.match(server, /new ReadableStream/);
  assert.match(server, /TextEncoder/);
  assert.match(server, /\\uFEFF/);
  assert.match(server, /EXPORT_BATCH_SIZE/);
  assert.match(server, /range\(options\.offset, options\.offset \+ options\.limit - 1\)/);
  assert.match(server, /if \(!rows\.length\) break;/);
  assert.match(server, /"Content-Type": "text\/csv; charset=utf-8"/);
  assert.match(server, /"Content-Disposition"/);
  assert.match(server, /"Cache-Control": "no-store"/);
  assert.match(server, /status: 403/);
  assert.match(server, /status: 503/);
  assert.match(server, /tidak memiliki izin ekspor/);

  // Ekspor kosong tetap mengirim header CSV (BOM + header) sebelum loop data.
  const streamIndex = server.indexOf("new ReadableStream");
  const headerIndex = server.indexOf("enqueue(`\\uFEFF${headerLine}\\r\\n`)", streamIndex);
  const loopIndex = server.indexOf("while (offset < EXPORT_MAX_ROWS)", streamIndex);
  assert.ok(headerIndex > streamIndex && headerIndex < loopIndex, "header harus dikirim sebelum baris data");

  // finance tidak pernah mengekspor metadata ledger (bisa memuat payload gateway).
  assert.match(server, /case "finance":\s*return "financial_ledger"/);
  const selectBlock = server.slice(server.indexOf("function selectFor"), server.indexOf("async function authorizeExport"));
  assert.doesNotMatch(selectBlock, /metadata/);
  assert.doesNotMatch(selectBlock, /password|pin|token|nik|ktp|card_number/i);

  assert.match(route, /handleAdminExport\(request, params\.kind\)/);
  const alias = read(FINANCE_ALIAS);
  assert.match(alias, /handleAdminExport\(request, "finance"\)/);
  assert.doesNotMatch(alias, /createAdminClient|limit\(50000\)|csvCell/);
});

test("v108 panel ekspor: filter aktif, loading, error ramah, unduhan", () => {
  const panel = read(PANEL);
  assert.match(panel, /defaultExportRange\(\)/);
  assert.match(panel, /parseExportRange\(from, to\)/);
  assert.match(panel, /new URLSearchParams\(\{ from, to \}\)/);
  assert.match(panel, /params\.set\("status", status\)/);
  assert.match(panel, /params\.set\("q", q\.trim\(\)\)/);
  assert.match(panel, /\/api\/admin\/export\/\$\{kind\}/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /LoadingSkeleton rows=\{2\}/);
  assert.match(panel, /loading={exporting}/);
  assert.match(panel, /"Menyiapkan file\.\.\."/);
  assert.match(panel, /URL\.createObjectURL/);
  assert.match(panel, /Content-Disposition/);
  assert.match(panel, /toast\.show\([^)]*"error"\)/s);
  assert.match(panel, /File CSV berhasil disiapkan/);
  assert.match(panel, /onFiltersChange/);
  assert.match(panel, /Rentang tanggal\s+wajib/);

  for (const [kind, file] of Object.entries(ADMIN_PAGES)) {
    const page = read(file);
    assert.ok(page.includes('from "@/components/ExportCsvPanel"'), `${file} harus memakai panel ekspor`);
    assert.ok(page.includes(`kind="${kind}"`), `${file} harus mengekspor jenis ${kind}`);
    assert.ok(page.includes("onFiltersChange"), `${file} harus meneruskan filter aktif`);
  }

  const finance = read(ADMIN_PAGES.finance);
  assert.doesNotMatch(finance, /\/api\/admin\/finance\/export\?from=/);
  assert.match(finance, /visibleRows/);
});
