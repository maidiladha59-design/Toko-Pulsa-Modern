import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

test('v81 customer pages no longer show gateway fee details', () => {
  const topupPage = read('src/app/wallet/topup/page.tsx');
  const orderPage = read('src/app/orders/[id]/page.tsx');
  const receiptPage = read('src/app/orders/[id]/receipt/page.tsx');

  // Halaman Top Up: sebutan "gateway" hilang dari semua teks tampilan.
  assert.doesNotMatch(topupPage, /Biaya gateway/);
  assert.doesNotMatch(topupPage, /Total sebelum biaya gateway/);
  assert.doesNotMatch(topupPage, /melalui gateway/);
  assert.doesNotMatch(topupPage, /payment\.fee/);

  // Label pengganti + catatan total final, keduanya tanpa kata "gateway".
  assert.match(topupPage, /Perkiraan Total/);
  assert.match(topupPage, /Total final akan ditampilkan di langkah berikutnya\./);

  // Baris "Biaya Admin" tetap (biaya milik AIDIL STORE), nominal tidak berubah.
  assert.match(topupPage, /Biaya Admin/);
  assert.match(topupPage, /\{formatRupiah\(amount\+adminFee\)\}/);
  assert.match(topupPage, /Total pembayaran<\/span><span className="tabular-nums">\{formatRupiah\(payment\.total_payment\)\}<\/span>/);
  assert.match(topupPage, /formatRupiah\(payment\.amount\)/);

  // Detail order: baris "ID Transaksi Gateway" & "Biaya gateway" hilang dari tampilan.
  assert.doesNotMatch(orderPage, /ID Transaksi Gateway/);
  assert.doesNotMatch(orderPage, /Biaya gateway/);
  // Total dibayar tetap nilai penuh dari server (termasuk biaya) — tidak diubah.
  assert.match(orderPage, /order\.gateway_total_payment \|\| order\.total_amount/);

  // Struk: label gateway hilang dari tampilan maupun teks cetak.
  assert.doesNotMatch(receiptPage, /ID Transaksi Gateway/);
  assert.doesNotMatch(receiptPage, /Biaya gateway/);
});

test('v81 admin visibility, API storage and migration wiring stay intact', () => {
  const adminTopups = read('src/app/admin/topups/page.tsx');
  const adminFinance = read('src/app/admin/finance/page.tsx');
  const topupRoute = read('src/app/api/topup/route.ts');
  const preflight = read('scripts/migration-preflight.mjs');
  const migration = read('supabase/migrations_v81_faq_gateway_wording.sql');

  // Admin tetap melihat rincian lengkap untuk rekonsiliasi.
  assert.match(adminTopups, /gateway_fee/);
  assert.match(adminFinance, /Biaya Gateway/);

  // Server tetap menghitung & menyimpan biaya gateway ke database.
  assert.match(topupRoute, /gateway_fee: payment\.fee \?\? 0/);
  assert.match(topupRoute, /fee: payment\.fee \?\? 0/);
  assert.match(topupRoute, /gateway_total_payment/);

  // Migrasi v81 mengganti wording FAQ pelanggan secara idempotent, terdaftar di preflight.
  assert.match(migration, /update public\.faqs/);
  assert.match(migration, /replace\(answer, 'gateway terverifikasi', 'pembayaran terverifikasi'\)/);
  assert.match(migration, /where answer like '%gateway terverifikasi%'/);
  assert.match(preflight, /migrations_v81_faq_gateway_wording\.sql/);
});

test('faq wording replacement removes the word gateway and is idempotent', () => {
  // Meniru replace() + WHERE LIKE di migrasi v81 (per baris jawaban FAQ).
  const replaceWording = (text) =>
    text.includes('gateway terverifikasi')
      ? text.replaceAll('gateway terverifikasi', 'pembayaran terverifikasi')
      : text;

  const seed = 'Pilih nominal, pilih metode pembayaran, lalu selesaikan pembayaran sebelum batas waktu. Saldo akan dikreditkan otomatis setelah gateway terverifikasi.';
  const fixed = replaceWording(seed);
  assert.doesNotMatch(fixed, /gateway/i);
  assert.match(fixed, /pembayaran terverifikasi\./);

  // Idempotent: menjalankan ulang tidak mengubah apa pun.
  assert.equal(replaceWording(fixed), fixed);

  // Baris tanpa frasa lama tidak tersentuh.
  const other = 'Mengapa saya tidak bisa membuat Top Up baru?';
  assert.equal(replaceWording(other), other);
});
