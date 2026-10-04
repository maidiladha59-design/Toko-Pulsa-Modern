-- AIDIL STORE v81 — GANTI ISTILAH "GATEWAY" DI TEKS FAQ PELANGGAN
-- Jalankan setelah v80.
-- Halaman FAQ pelanggan di-render langsung dari tabel public.faqs, dan seed v46
-- memuat kalimat "... setelah gateway terverifikasi." yang menyebut istilah internal.
-- Migrasi ini mengganti frasa tersebut menjadi "pembayaran terverifikasi" supaya
-- pelanggan tidak melihat istilah gateway, TANPA menyentuh pertanyaan/jawaban lain
-- yang mungkin sudah diedit admin.
-- Idempotent: hanya baris yang masih memuat frasa lama yang tersentuh, sehingga
-- aman dijalankan berulang kali.

update public.faqs
set answer = replace(answer, 'gateway terverifikasi', 'pembayaran terverifikasi'),
    updated_at = now()
where answer like '%gateway terverifikasi%';
