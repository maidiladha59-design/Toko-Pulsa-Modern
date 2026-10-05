-- AIDIL STORE v82 — BERSIHKAN JUDUL BANNER YANG BERISI NAMA FILE MENTAH
-- Jalankan setelah v81.
-- Sebelum perbaikan, tombol "Upload & Aktifkan Banner" di halaman admin
-- Platform & Biaya mengisi public.home_banners.title dengan nama file asli
-- (f.name). Akibatnya nama file acak tampil menimpa gambar banner di beranda.
-- Kode frontend sudah diperbaiki (banner baru tersimpan dengan title ''),
-- migrasi ini membersihkan data lama yang sudah telanjur tersimpan.
--
-- Pola yang dibersihkan (dua-duanya nama yang dihasilkan mesin, bukan judul
-- yang diketik admin):
--   1. file_<heksadesimal panjang>  — nama berkas hasil unduhan Supabase Storage
--      (objek disimpan sebagai crypto.randomUUID() + ekstensi, lalu diunduh
--      browser menjadi file_<uuid tanpa strip>).
--   2. <uuid> atau <uuid>.<ekstensi> — nama file UUID mentah.
-- Judul yang hanya berisi spasi juga dinormalkan menjadi string kosong.
-- Kolom description, file_url, file_type, href, sort_order, dan is_active
-- TIDAK disentuh. Admin tetap bisa mengetik judul manual lewat kolom "Judul".
--
-- Idempotent: hanya baris dengan title <> '' yang cocok pola di atas yang
-- tersentuh, sehingga aman dijalankan berulang kali.

update public.home_banners
set title = '',
    updated_at = now()
where title <> ''
  and (
        title ~* '^file_?[0-9a-f]{16,}'
     or title ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]+)?$'
     or btrim(title) = ''
  );
