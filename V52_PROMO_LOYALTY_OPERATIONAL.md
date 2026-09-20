# AIDIL STORE v52 — Promo, Voucher & Loyalty Operational

v52 mengaktifkan loyalty yang sebelumnya sudah memiliki tabel/fitur dasar pada v42–v45.

## Loyalty otomatis
- Order yang berpindah ke `COMPLETED` mendapatkan poin otomatis.
- Dasar: 1 poin per Rp1.000 nilai order.
- Multiplier mengikuti level loyalty saat transaksi selesai.
- Ledger menggunakan referensi `ORDER_COMPLETED` + order id sehingga idempotent.
- Retry/update status `COMPLETED` tidak menggandakan poin.

## Customer
- `GET /api/loyalty` menampilkan poin, lifetime points, level, dan multiplier.
- Halaman `/loyalty` menampilkan ringkasan loyalty.

## Catatan
- Poin belum dibuat sebagai alat pembayaran/penukaran agar saldo wallet tetap terpisah.
- Pembalikan poin untuk refund sengaja tidak otomatis dilakukan pada v52; itu perlu kebijakan bisnis khusus agar tidak mengurangi poin secara salah pada kasus refund parsial/komplain.
