-- v86: Bersihkan daftar metode Top Up dari peninggalan gateway FR3 Newera.
--
-- Midtrans Core API hanya menerima payment_type 'qris' dan 'bank_transfer' dengan
-- bank bca / bni / bri / permata (whitelist kode: src/lib/midtrans.ts -> GATEWAY_METHODS).
-- Baris lama seperti atm_bersama_va, artha_graha_va, cimb_niaga_va, maybank_va,
-- bnc_va, dan sampoerna_va masih tersimpan di topup_payment_methods. Kalau is_active
-- nya true, metode itu ikut tampil di halaman Top Up lalu PASTI gagal saat dipilih
-- (ditolak validasi server, atau ditolak Midtrans dengan status 402).
--
-- Migrasi ini HANYA mengubah data. Tidak ada perubahan struktur tabel, kolom,
-- constraint, RLS, maupun policy. Aman dijalankan berulang kali (idempotent).
--
-- Metode yang dinonaktifkan TIDAK dihapus supaya label riwayat top up lama tetap
-- punya rujukan, dan admin bisa mengaktifkan ulang lewat panel bila suatu saat
-- Midtrans menambahkan dukungan bank tersebut.

-- 1) Pastikan kelima metode yang didukung Midtrans tersedia.
--    on conflict do nothing: status aktif/nonaktif pilihan admin tidak ditimpa.
insert into public.topup_payment_methods(provider_method,label,description,payment_type,sort_order) values
('qris','QRIS','Bayar dengan aplikasi yang mendukung QRIS.','QRIS',10),
('bca_va','BCA Virtual Account','Bayar melalui BCA atau kanal yang mendukung BCA VA.','VA',15),
('bri_va','BRI Virtual Account','Bayar melalui BRI atau kanal yang mendukung BRI VA.','VA',20),
('bni_va','BNI Virtual Account','Bayar melalui BNI atau kanal yang mendukung BNI VA.','VA',30),
('permata_va','Permata Virtual Account','Bayar melalui Permata.','VA',50)
on conflict(provider_method) do nothing;

-- 2) Nonaktifkan semua metode di luar whitelist Midtrans.
update public.topup_payment_methods
set is_active = false, updated_at = now()
where is_active = true
  and provider_method not in ('qris','bca_va','bni_va','bri_va','permata_va');
