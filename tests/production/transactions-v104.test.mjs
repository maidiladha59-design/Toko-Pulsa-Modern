import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('v104 badge status: satu sumber label, warna sesuai makna, tidak pernah satu baris terpotong', () => {
  const badge = read('src/components/StatusBadge.tsx');
  assert.match(badge, /import \{ statusLabel \} from "@\/lib\/labels"/);
  assert.match(badge, /whitespace-nowrap/);
  assert.match(badge, /PROCESSING: "bg-warning-100/);
  assert.match(badge, /PENDING: "bg-warning-100/);
  assert.match(badge, /COMPLETED: "bg-emerald-100/);
  assert.match(badge, /FAILED: "bg-red-100/);
  assert.match(badge, /CANCELLED: "bg-gray-100/);
  assert.match(badge, /EXPIRED: "bg-gray-100/);
  assert.match(badge, /REFUNDED: "bg-sky-100/);
  assert.match(badge, /\{statusLabel\(status\)\}/);
  assert.doesNotMatch(badge, /truncate/);
});

test('v104 daftar transaksi: kartu produk, target tersamar, tanggal + nominal, badge kanan atas', () => {
  const center = read('src/components/TransactionCenter.tsx');
  assert.match(center, /import ProductImage from "@\/components\/ProductImage"/);
  assert.match(center, /import \{[\s\S]*transactionDayKey,[\s\S]*transactionDayLabel,[\s\S]*\} from "@\/lib\/transaction-view"/);
  assert.match(center, /className="h-12 w-12 shrink-0 rounded-xl border border-app-border"/);
  assert.match(center, /break-words text-base font-semibold leading-5 text-app-text/);
  assert.match(center, /<StatusBadge status=\{entry\.status\} \/>/);
  assert.match(center, /\{formatDate\(entry\.date\)\}/);
  assert.match(center, /amount > 0 \? "\+" : amount < 0 \? "−" : ""/);
  assert.doesNotMatch(center, />Digital</, 'badge Digital terpisah sudah dihapus');
  assert.doesNotMatch(center, /truncate/, 'tidak boleh memotong teks judul/target');
});

test('v104 tab, pencarian, grup tanggal, dan pemuatan bertahap 20', () => {
  const center = read('src/components/TransactionCenter.tsx');
  for (const label of ['Semua', 'Berhasil', 'Diproses', 'Gagal', 'Top Up']) {
    assert.ok(center.includes(label), `tab ${label} harus ada`);
  }
  assert.match(center, /const PAGE_SIZE = 20;/);
  assert.match(center, /setTimeout\(\(\) => setDebouncedQuery\(query\), 300\)/);
  assert.match(center, /placeholder="Cari produk, nomor tujuan, atau invoice\.\.\."/);
  assert.match(center, /\[scrollbar-width:none\]/);
  assert.match(center, /\[&::-webkit-scrollbar\]:hidden/);
  assert.match(center, /transactionDayLabel/);
  const view = read('src/lib/transaction-view.ts');
  assert.match(view, /"Hari ini"/);
  assert.match(view, /"Kemarin"/);
  assert.match(center, /Transaksi tidak ditemukan/);
  assert.match(center, /Belum ada transaksi/);
  assert.match(center, /IntersectionObserver/);
  assert.match(center, /Muat lebih banyak/);
});

test('v104 pemetaan status memakai label manusiawi, bukan enum mentah', () => {
  const labels = read('src/lib/labels.ts');
  assert.match(labels, /REFUNDED: "Dikembalikan ke saldo"/);
  assert.match(labels, /PROCESSING: "Diproses"/);
  assert.match(labels, /COMPLETED: "Berhasil"/);
  assert.match(labels, /FAILED: "Gagal"/);
  assert.match(labels, /EXPIRED: "Dibatalkan"/);
  const view = read('src/lib/transaction-view.ts');
  assert.match(view, /export function transactionStatusKind/);
  assert.match(view, /export function maskTarget/);
  assert.match(view, /export function transactionDayLabel/);
});

test('v104 query server transaksi: join produk/target/gambar + refund, tanpa menggandakan pembelian saldo', () => {
  const page = read('src/app/transactions/page.tsx');
  assert.match(page, /\.from\("orders"\)/);
  assert.match(page, /Promise\.all/);
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /order_items\(id, product_id, product_name, unit_price, quantity, subtotal, products\(thumbnail_url, categories\(slug\)\)\)/);
  assert.match(page, /\.from\("ppob_order_targets"\)/);
  assert.match(page, /\.from\("ppob_services"\)\.select\("product_id, brand"\)/);
  assert.match(page, /\.from\("product_images"\)/);
  assert.match(page, /\.from\("wallet_transactions"\)/);
  assert.match(page, /refundByOrder/);
  assert.match(page, /row\.type === "PURCHASE" \|\| row\.type === "REFUND"/);
  assert.match(page, /status: refund \? "REFUNDED" : order\.status/);
  assert.match(page, /Refund: \$\{refProduct\}/);
  assert.match(page, /Pembayaran saldo: \$\{refProduct\}/);
  assert.match(page, /Top Up Saldo/);
  assert.match(page, /maskTarget\(target\)/);
});

test('v104 detail pesanan: gambar, target penuh, invoice/SN dapat disalin, beli lagi, bantuan, cek status', () => {
  const page = read('src/app/orders/[id]/page.tsx');
  assert.match(page, /import ProductImage from "@\/components\/ProductImage"/);
  assert.match(page, /import CopyButton from "@\/components\/CopyButton"/);
  assert.match(page, /import RefreshStatusButton from "@\/components\/RefreshStatusButton"/);
  assert.match(page, /Transaksi sedang diproses/);
  assert.match(page, /Nomor Tujuan/);
  assert.match(page, /SN \/ Token \/ Voucher/);
  assert.match(page, /<CopyButton value=\{view\.target\} label="Salin" \/>/);
  assert.match(page, /<CopyButton value=\{view\.tx\.serial_number\} label="Salin" \/>/);
  assert.match(page, /<CopyButton value=\{order\.order_number\} label="Salin" \/>/);
  assert.match(page, /Beli Lagi/);
  assert.match(page, /Bantuan/);
  assert.match(page, /\/bantuan\?order=/);
  assert.match(page, /paymentMethodLabel\(order\.payment_method\)/);
  assert.match(page, /Biaya Admin/);
  assert.match(page, /Dikembalikan ke saldo/);
  assert.match(page, /GENERIC_ERRORS\.serviceDown/);
  assert.doesNotMatch(page, /provider_message\}/, 'pesan provider mentah tidak dirender');
});

test('v104 detail saldo: refund dan pembayaran menyebut produk asal', () => {
  const page = read('src/app/transactions/wallet/[id]/page.tsx');
  assert.match(page, /\.from\("orders"\)/);
  assert.match(page, /Refund: \$\{refOrder\.product_name\}/);
  assert.match(page, /Pembayaran saldo: \$\{refOrder\.product_name\}/);
  assert.match(page, /TRANSFER: "Transfer Saldo"/);
  assert.match(page, /Invoice/);
});

test('v104 beli lagi: checkout mengisi target awal dan bantuan membawa invoice', () => {
  const checkout = read('src/app/checkout/page.tsx');
  assert.match(checkout, /const initialTarget = searchParams\.get\("target"\) \|\| ""/);
  assert.match(checkout, /f\.name === "customer_no" \? initialTarget : ""/);
  const help = read('src/app/bantuan/page.tsx');
  assert.match(help, /searchParams\.get\("order"\)/);
  assert.match(help, /searchParams\.get\("invoice"\)/);
  assert.match(help, /Bantuan pesanan \$\{inv\}/);
});

test('v104 tanpa migrasi baru: order_items.product_name sudah snapshot, brand/target dibaca dari relasi', () => {
  const schema = read('supabase/schema.sql');
  assert.match(schema, /product_name text not null,   -- snapshot nama saat transaksi/);
  const migrations = fs.readdirSync(path.join(root, 'supabase')).filter((file) => /^migrations_v104/.test(file));
  assert.equal(migrations.length, 0, 'tidak perlu migrasi v104 untuk tampilan transaksi');
});
