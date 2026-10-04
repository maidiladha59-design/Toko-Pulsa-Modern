import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const MIGRATION = "supabase/migrations_v79_support_order_id_required.sql";
const PAGE = "src/app/bantuan/page.tsx";
const UTILS = "src/lib/utils.ts";

test('v79: order_id wajib + format salah ditangkap sebagai pesan ramah (bukan 22P02 mentah)', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /drop function if exists public\.create_support_ticket\(text,text,uuid,text\);/);
  assert.match(sql, /p_order_id text/);
  assert.match(sql, /raise exception 'ORDER_REQUIRED'/);
  assert.match(sql, /v_order_id := trim\(p_order_id\)::uuid;/);
  assert.match(sql, /exception when invalid_text_representation then\s+raise exception 'INVALID_ORDER_ID';/);
  // Kepemilikan order tetap ditegakkan di server
  assert.match(sql, /raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN'/);
  // Perilaku lama yang harus tetap ada
  assert.match(sql, /TOO_MANY_OPEN_TICKETS/);
  assert.match(sql, /'PENGADUAN'/);
  assert.match(sql, /v_priority := 'HIGH'/);
});

test('v79: skema TIDAK diubah (tiket lama boleh kosong, FK on delete set null aman)', () => {
  const sql = read(MIGRATION);
  assert.doesNotMatch(sql, /alter table/i);
  assert.doesNotMatch(sql, /set not null/i);
});

test('v79: grant hanya untuk authenticated/service_role dengan signature text yang baru', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /revoke all on function public\.create_support_ticket\(text,text,text,text\) from public,anon;/);
  assert.match(sql, /grant execute on function public\.create_support_ticket\(text,text,text,text\) to authenticated,service_role;/);
});

test('v79: form bantuan memvalidasi ID Order sebelum memanggil RPC', () => {
  const s = read(PAGE);
  // Label wajib + placeholder baru
  assert.match(s, /ID Order <span className="text-gold-400">\*<\/span>/);
  assert.doesNotMatch(s, /ID Order \(opsional\)/);
  // Validasi kosong
  assert.match(s, /ID Order wajib diisi\. Kamu bisa menyalin ID Order dari halaman Pesanan Saya\./);
  // Validasi format UUID + kepemilikan sebelum kirim
  assert.match(s, /\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$/);
  assert.match(s, /Format ID Order tidak valid\. ID Order bisa dilihat di halaman Pesanan Saya\./);
  assert.match(s, /from\("orders"\)\.select\("id"\)\.eq\("id",trimmedOrderId\)\.maybeSingle\(\)/);
  assert.match(s, /ID Order tidak ditemukan di akunmu\./);
  // Jalur atomic tetap satu RPC, order id terkirim setelah lolos validasi
  assert.match(s, /supabase\.rpc\("create_support_ticket"/);
  assert.match(s, /p_order_id:trimmedOrderId/);
});

test('v79: humanizeError memetakan error order ke pesan Indonesia yang ramah', () => {
  const s = read(UTILS);
  for (const token of ["order_not_found_or_forbidden", "invalid_order_id", "invalid input syntax for type uuid", "order_required"]) {
    assert.ok(s.includes(token), token);
  }
  assert.match(s, /Format ID Order tidak valid\. ID Order bisa dilihat di halaman Pesanan Saya\./);
});

test('v79 terdaftar di migration preflight', () => {
  const preflight = read("scripts/migration-preflight.mjs");
  assert.match(preflight, /76,77,78,79/);
  assert.match(preflight, /migrations_v79_support_order_id_required\.sql/);
});
