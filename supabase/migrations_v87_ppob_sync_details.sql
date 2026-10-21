-- v87: Laporan progres & rincian sinkronisasi PPOB.
--
-- Sinkronisasi lama memproses SKU satu-per-satu (3 query per SKU) sehingga
-- sering terpotong batas waktu Vercel di tengah daftar: sebagian produk tidak
-- pernah tersinkron dan admin hanya melihat pesan gagal tanpa tahu seberapa
-- jauh proses berjalan. Kode sekarang memproses per batch dan menulis progres
-- ke ppob_provider_syncs; migrasi ini menambah dua kolom (additive, tanpa ubah
-- tipe/constraint/RLS):
--   processed_count : berapa SKU sudah diproses (progres saat masih RUNNING,
--                     dan total saat SUCCESS/FAILED).
--   details         : rincian alasan SKU dilewati + jumlah kategori fallback.
-- Jalankan SETELAH kode baru dideploy. Sinkronisasi tetap berfungsi normal
-- sebelum migrasi ini dijalankan — hanya progres/rincian tidak dipersist.

alter table public.ppob_provider_syncs
  add column if not exists processed_count integer not null default 0;

alter table public.ppob_provider_syncs
  add column if not exists details jsonb;
