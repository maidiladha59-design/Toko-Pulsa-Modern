# AIDIL STORE v40 — Payment Reconciliation + Refund Center

## Tujuan
Satu pusat admin untuk mencocokkan aliran:

**Pakasir → AIDIL STORE → Wallet → Digiflazz → Refund**

## Yang tersedia
- Reconciliation untuk TOPUP, ORDER gateway, dan PPOB.
- Live Pakasir Transaction Detail check untuk transaksi gateway yang masih PENDING/VERIFYING/PROCESSING.
- Internal wallet ledger check untuk memastikan kredit/debit benar-benar tercatat.
- PPOB check: status transaksi, order, wallet debit, dan refund.
- Refund otomatis saat PPOB gagal.
- Refund idempotent: satu order tidak boleh menghasilkan kredit refund ganda.
- Retry refund FAILED dari Admin → Rekonsiliasi & Refund.
- Deteksi kasus seperti paid-but-not-credited, wallet debit tanpa alur order yang sinkron, dan PPOB gagal tanpa refund selesai.
- Audit log untuk refund yang selesai.

## Endpoint admin
- `GET /api/admin/reconciliation`
- `POST /api/admin/reconciliation/run`
- `POST /api/admin/reconciliation/refund`

## Database
Migration utama:
- `supabase/migrations_v40_reconciliation_refund.sql`

Migration v40 sekarang juga berisi hardening runner dan retry refund.

## Catatan produksi
Reconciliation runner melakukan pemeriksaan live Pakasir hanya untuk transaksi gateway yang masih perlu diverifikasi. Status Digiflazz pada runner direkonsiliasi dari data transaksi/provider response yang sudah tersimpan di database; pengecekan provider live tambahan dapat ditambahkan jika endpoint status provider ingin dijalankan sebagai worker terjadwal.

Sebelum produksi:
1. Apply migration v40 di Supabase.
2. Pastikan `PAKASIR_PROJECT` dan `PAKASIR_API_KEY` tersedia sebagai server environment.
3. Uji sandbox: pembayaran Pakasir → webhook → wallet → PPOB sukses.
4. Uji failure: provider PPOB gagal → order FAILED → refund COMPLETED.
5. Uji retry: refund FAILED → tombol Retry → wallet hanya mendapat satu kredit refund.
6. Jalankan `npm test` dan `npm run validate:migrations`.
