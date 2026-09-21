-- AIDIL STORE v73 — Simpan txn_id Pakasir (API v2) pada order & pastikan kolom topup ada.
-- Apply setelah v72 (v72 tidak punya migration SQL). Aman dijalankan ulang (idempotent).
--
-- Latar belakang:
--   Pakasir API v2 memakai `txn_id` (dikembalikan saat create-transaction) untuk
--   endpoint transaction-status. Sebelumnya orders.gateway_reference hanya berisi
--   order_number buatan kita sendiri, sehingga polling status & reconciliation
--   untuk order QRIS/VA mengirim ID yang salah jenis ke Pakasir.
--
--   - orders.gateway_reference  = order_id yang KITA kirim ke Pakasir (= order_number)
--   - orders.gateway_txn_id     = txn_id yang DIBERIKAN Pakasir  (dipakai untuk cek status)

alter table public.orders
  add column if not exists gateway_txn_id text;

create unique index if not exists orders_gateway_txn_id_uidx
  on public.orders(gateway_txn_id)
  where gateway_txn_id is not null;

-- Kode top-up (/api/topup, webhook, reconciliation) sudah memakai topups.provider_txn_id,
-- tetapi kolom ini tidak pernah dibuat oleh migration v34/v35. Tanpa kolom ini
-- update setelah create-transaction gagal dan setiap Top Up otomatis dibatalkan.
alter table public.topups
  add column if not exists provider_txn_id text;

create index if not exists topups_provider_txn_id_idx
  on public.topups(provider_txn_id)
  where provider_txn_id is not null;

-- Order lama (dibuat sebelum v73) tidak punya gateway_txn_id. Untuk order yang masih
-- PENDING, webhook akan mengisinya otomatis saat pembayaran masuk (fallback pada
-- txn_id dari payload webhook yang tetap diverifikasi ulang ke Pakasir).
