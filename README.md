# Aidil Store v8 — Automatic Payment Edition

Marketplace produk digital berbasis Next.js + Supabase.

## Fitur
- Beranda marketplace modern
- Login, daftar, lupa/reset password
- Dashboard pengguna
- Produk dan kategori
- Detail produk
- Checkout menggunakan saldo wallet
- Pembayaran otomatis QRIS/e-wallet melalui gateway
- Pembayaran otomatis Virtual Account bank
- Verifikasi status pembayaran via webhook + Transaction Detail API
- Produk digital otomatis berstatus selesai setelah pembayaran terverifikasi
- Wallet + riwayat transaksi
- Top Up dengan metode pembayaran yang dikelola admin
- Upload bukti pembayaran Top Up
- Admin verifikasi/menolak Top Up
- Admin kelola produk, pengguna, order, metode pembayaran
- Download produk digital setelah pembelian
- Logo Aidil Store sebagai satu-satunya branding visual utama
- Responsive untuk HP dan laptop

## Pembayaran otomatis
Versi ini tidak memakai Midtrans. Checkout produk dapat memakai:
- Wallet internal (langsung dipotong secara atomic).
- QRIS untuk pembayaran dari aplikasi yang mendukung QRIS, termasuk e-wallet/mobile banking yang mendukung QRIS.
- Virtual Account bank (BRI, BNI, CIMB Niaga, Permata, Maybank, BNC, Sampoerna, ATM Bersama, Artha Graha).

Untuk QRIS/VA, status pembayaran dikonfirmasi otomatis melalui webhook dan diverifikasi ulang ke Transaction Detail API. Tidak ada upload bukti transfer atau approve admin untuk checkout gateway.

**Penting:** agar pembayaran otomatis benar-benar aktif di production, isi `PAKASIR_PROJECT` dan `PAKASIR_API_KEY`, lalu daftarkan webhook:
`https://DOMAIN-KAMU/api/payments/pakasir/webhook`

Top Up wallet manual yang sudah ada tetap dapat memakai alur verifikasi admin. Checkout dengan wallet internal tidak membutuhkan approve admin.

## Profil
Profil sekarang mendukung nama lengkap, email, nomor HP/WhatsApp, alamat, kota/kabupaten, dan kode pos. Jalankan migration v8 sebelum memakai field baru.

## Environment
Buat `.env.local` dari `.env.example` dan isi hanya konfigurasi Supabase yang kamu miliki.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=
```

Jangan membagikan service role key atau secret lainnya.

## Menjalankan
```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

## Database v5
Untuk instalasi baru/reset, jalankan di Supabase SQL Editor secara berurutan:
1. reset database yang aman
2. `supabase/schema.sql`
3. `supabase/storage_and_seed.sql`
4. `supabase/migrations_product_media.sql`
5. `supabase/migrations_topup_robust_fix.sql`

`supabase/migrations_v5_remove_midtrans.sql` hanya diperlukan jika meng-upgrade database lama tanpa reset.

## Critical fixes migration (existing v5 database)

If you are updating an existing Aidil Store v5 database, run this file **once** in Supabase SQL Editor after the previously completed migrations:

`supabase/migrations_v5_critical_fixes.sql`

It fixes:
- digital checkout orders becoming `COMPLETED` automatically;
- admin order status management and safe refund handling;
- audit logging for order status changes.

For a fresh database, `schema.sql` already contains the corrected checkout behavior.

## v25 — Automated PPOB tests

Run the offline production safety tests with:

```bash
npm test
```

The suite checks wallet idempotency, authentication/target validation, wallet locking, refund idempotency, atomic provider claims, retry cooldown/max attempts, order finalization rules, webhook signature ordering, and cron authorization.

Before real-money production, also run provider/Supabase integration tests against a dedicated test environment.


## v38 — Financial Dashboard
- Financial ledger untuk order selesai/refund dan top-up fee.
- Dashboard Admin `/admin/finance` dengan periode hari ini, 7 hari, dan 30 hari.
- Export CSV laporan keuangan.
- Perhitungan biaya provider dan gateway dipisahkan dari fee/margin.
- Jalankan migration `supabase/migrations_v38_financial_dashboard.sql` setelah v37.

## v40
Payment Reconciliation & Refund Center: `supabase/migrations_v40_reconciliation_refund.sql`, `/admin/reconciliation`.
