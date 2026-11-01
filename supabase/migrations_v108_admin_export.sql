-- AIDIL STORE v108: izin ekspor CSV di panel admin
--
-- Latar belakang:
--   Halaman Pesanan, Pengguna, Top Up, dan Keuangan sekarang punya tombol
--   "Ekspor CSV". Route handler memeriksa sesi admin, izin halaman yang
--   bersangkutan (orders.manage / users.view / topups.manage / finance.view),
--   DAN izin khusus 'export' sebelum membaca data, lalu mencatat setiap ekspor
--   ke public.audit_logs (action = 'admin.export').
--
-- Isi migrasi ini hanya MENAMBAH satu permission baru ke katalog v43/v53.
--   - Tidak ada tabel baru.
--   - Tidak ada perubahan kolom, policy, trigger, atau fungsi.
--   - Tidak menyentuh ledger saldo, top up, order, webhook, atau PIN.
--   - idempotent: aman dijalankan ulang.
--
-- Setelah migrasi dijalankan, SUPER_ADMIN dapat mencabut izin 'export' untuk
-- role ADMIN lewat /admin/permissions. Tanpa baris ini, semua ekspor ditolak
-- dengan pesan bahwa izin ekspor belum tersedia.

insert into public.admin_role_permissions (role, permission, enabled)
values
  ('ADMIN', 'export', true),
  ('SUPER_ADMIN', 'export', true)
on conflict (role, permission) do nothing;

comment on table public.admin_role_permissions is
  'Permission granular admin (v43/v53). v108 menambahkan permission ''export'' untuk ekspor CSV yang diaudit.';
