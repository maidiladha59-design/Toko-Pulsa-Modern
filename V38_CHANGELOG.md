# AIDIL STORE v38 — Financial Dashboard

## Fitur
- Financial ledger terpisah untuk `ORDER_SALE`, `ORDER_REFUND`, dan `TOPUP_FEE`.
- Idempotensi ledger agar event yang sama tidak tercatat dua kali.
- Backfill idempotent untuk order COMPLETED dan topup APPROVED yang sudah ada.
- Dashboard Admin di `/admin/finance`.
- Periode: hari ini, 7 hari, 30 hari.
- Ringkasan gross sales, fee/margin, biaya provider, biaya gateway, keuntungan bersih, fee top-up, order, top-up, dan refund.
- Laporan harian dan riwayat transaksi keuangan.
- Export CSV dengan filter tanggal.

## Catatan
Biaya provider hanya dapat dihitung jika data modal provider tersedia. Produk non-PPOB tanpa data modal tidak dianggap memiliki biaya modal yang diketahui. Karena itu angka profit pada dashboard adalah keuntungan/kontribusi berdasarkan biaya yang tercatat, bukan laporan akuntansi resmi.
