# AIDIL STORE — v30 Supabase Production Smoke Test

## Tujuan
Pemeriksaan ini memvalidasi koneksi dasar ke project Supabase target dan keberadaan endpoint REST untuk tabel inti PPOB. Nilai secret tidak pernah dicetak ke output.

## Mode
- `npm run smoke:supabase` — configuration-only; aman dijalankan tanpa credential.
- `npm run smoke:supabase:live` — melakukan request HTTPS ke Supabase menggunakan `.env.local` atau environment variables.

## Yang diperiksa saat live
- Supabase Auth settings endpoint.
- Tabel: `profiles`, `wallets`, `wallet_transactions`, `orders`, `order_items`, `ppob_services`, `ppob_transactions`, `ppob_order_targets`, `ppob_inquiries`, `notifications`, `ppob_webhook_events`, `ppob_provider_syncs`.
- RPC endpoint melalui `OPTIONS` bila server mendukungnya. Smoke test sengaja tidak memanggil RPC mutasi agar tidak membuat transaksi, refund, atau perubahan data.

## Batasan penting
HTTP 200 pada tabel membuktikan endpoint REST dapat dijangkau dengan key yang digunakan, tetapi bukan bukti seluruh RLS/business rules benar. `OPTIONS` pada RPC juga bukan bukti final bahwa signature RPC dapat dieksekusi.

Smoke test tidak membuktikan bahwa seluruh migration telah diterapkan pada remote database; gunakan Supabase migration history/SQL Editor untuk verifikasi migration yang sebenarnya.
