-- AIDIL STORE v84 — INDEKS DATABASE UNTUK KOLOM YANG SERING DIFILTER
-- Jalankan setelah v83.
-- Hasil audit pola query di src/app dan src/lib (filter .eq()/.in() plus
-- urutan created_at): 4 tabel panas belum punya indeks yang cocok, padahal
-- querynya jalan di hampir semua halaman pelanggan (daftar pesanan,
-- transaksi, wallet, dan riwayat top up). Kolom lain yang masuk daftar audit
-- (notifications, push_subscriptions, payment_requests, split_bill_*,
-- audit_logs, ppob_*, dll) sudah tercover indeks lama — tidak ada perubahan.
--
-- Migrasi ini HANYA menambah indeks. Tidak menyentuh tabel, kolom,
-- constraint, RLS, RPC, atau data sama sekali.
--
-- Idempotent: semua pernyataan memakai "create index if not exists",
-- jadi aman dijalankan berulang kali.

-- Riwayat pesanan milik satu user (halaman /orders dan /transactions:
-- .eq("user_id").order("created_at", { ascending: false })).
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);

-- Item milik satu pesanan (detail pesanan, struk, checkout, unduhan produk:
-- .eq("order_id", ...)). Belum ada indeks apa pun di tabel ini.
create index if not exists order_items_order_idx on public.order_items(order_id);

-- Mutasi dompet per wallet + urut waktu (halaman /transactions dan /wallet:
-- .eq("wallet_id").order("created_at", { ascending: false })). Indeks unik
-- parsial lama hanya menutup kasus REFUND, bukan riwayat umum.
create index if not exists wallet_transactions_wallet_created_idx on public.wallet_transactions(wallet_id, created_at desc);

-- Riwayat top up milik user (cek top up aktif dan daftar riwayat:
-- .eq("user_id").order("created_at", { ascending: false })). Indeks unik
-- parsial lama hanya menutup top up PENDING/VERIFYING yang sedang aktif.
create index if not exists topups_user_created_idx on public.topups(user_id, created_at desc);
