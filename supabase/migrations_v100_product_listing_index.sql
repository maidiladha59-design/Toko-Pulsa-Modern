-- AIDIL STORE v100 — INDEKS DAFTAR PRODUK PUBLIK
-- Jalankan setelah v99 (boleh juga setelah v84).
--
-- Halaman beranda dan /layanan membaca daftar produk dengan pola:
--   .from('products').select(...).eq('is_active', true).order('created_at', { ascending: false })
-- Audit indeks sebelumnya (v84) hanya menutup orders, order_items,
-- wallet_transactions, dan topups. Tabel products belum punya indeks yang
-- cocok untuk filter + urutan di atas, sehingga Postgres melakukan sort
-- seluruh baris aktif setiap kali daftar produk dibuka.
--
-- Migrasi ini HANYA menambah satu indeks. Tidak ada perubahan tabel, kolom,
-- constraint, RLS, RPC, maupun data.
--
-- Idempotent: memakai "create index if not exists", aman dijalankan berulang.

create index if not exists products_active_created_idx
  on public.products(is_active, created_at desc);
