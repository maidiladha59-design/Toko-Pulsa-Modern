# AIDIL STORE v73 — Perbaikan txn_id Pakasir (API v2)

**Wajib jalankan migration:** `supabase/migrations_v73_gateway_txn_id.sql`

## Masalah
- `orders.gateway_reference` berisi order_number buatan sendiri, tetapi `transaction-status` v2 butuh `txn_id` Pakasir -> polling & reconciliation order QRIS/VA salah/gagal.
- Route order masih membaca `payment.payment_number` (format v1); v2 memakai `qr_string` / `va_number` -> error TypeScript & nomor pembayaran kosong.
- Kolom `topups.provider_txn_id` dipakai kode tetapi tidak dibuat migration mana pun -> Top Up gagal saat update setelah create-transaction.
- Reconciliation cron memanggil `getPakasirTransactionDetail(order_id, amount)` (gaya v1).
- Status "canceled" (ejaan v2) tidak dikenali polling.

## Perubahan
- Migration v73: `orders.gateway_txn_id` (+unique index), `topups.provider_txn_id`.
- `lib/pakasir.ts`: helper `extractPakasirPaymentNumber`, `isPakasirFailedStatus`; tambah `atm_bersama_va` ke tipe.
- `checkout/gateway`, `checkout/qris`, `ppob/postpaid/pay`: simpan `gateway_txn_id`, pakai qr_string/va_number, cek error simpan.
- `orders/[id]/status`: cek status via `gateway_txn_id`, verifikasi order_id, jalankan fulfillment PPOB bila webhook terlewat.
- `payments/pakasir/webhook`: jalur order memakai `gateway_txn_id` (fallback ke txn_id payload untuk order lama, lalu mengisi kolomnya).
- `reconciliation/cron`: topup via `provider_txn_id`; order PENDING/PROCESSING dicek via `gateway_txn_id`.
- Link notifikasi Top Up `/topup/history` (404) -> `/wallet/topup`.
- Test baru: `tests/production/gateway-txn-id-v73.test.mjs`; preflight menambahkan v73.
