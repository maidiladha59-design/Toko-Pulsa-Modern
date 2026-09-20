# AIDIL STORE v53 — Admin Permission & Audit Center Operational

## Perubahan
- Memperbaiki perbandingan `profiles.role` enum dengan `admin_role_permissions.role` text.
- SUPER_ADMIN tidak dapat mengubah permission milik role SUPER_ADMIN dari endpoint permission, mencegah self-lockout.
- Permission center hanya menampilkan/mengubah permission role ADMIN.
- Audit API kini membutuhkan permission `audit.view` dan mendukung filter action, target type, actor serta pagination.
- Menambah index audit untuk filter target.

## Catatan
Permission yang sudah dinonaktifkan untuk ADMIN tetap harus dihormati oleh endpoint bisnis terkait. v53 memperkuat pusat permission/audit; migrasi ke enforcement semua endpoint dapat dilakukan bertahap tanpa mengubah transaksi yang sedang berjalan.
