# AIDIL STORE v48 — Maintenance Mode & System Control

## Fitur
- Admin dapat menyalakan/mematikan maintenance mode tanpa mengubah kode.
- Judul dan pesan maintenance dapat diedit.
- Waktu mulai dan selesai dapat dijadwalkan.
- Admin/SUPER_ADMIN tetap dapat membuka dashboard saat maintenance aktif.
- Halaman pelanggan diarahkan ke `/maintenance`.
- API customer menerima HTTP 503 dengan kode `MAINTENANCE` selama maintenance aktif.
- Webhook pembayaran, PPOB webhook, dan cron operasional tetap berjalan untuk menyelesaikan transaksi yang sudah dimulai.
- Perubahan ON/OFF dicatat ke `audit_logs`.
- Halaman maintenance memiliki tombol `Coba Lagi`.

## Supabase
Database AIDIL STORE harus sudah sampai v47. Jalankan satu kali:

`supabase/migrations_v48_maintenance_mode.sql`

Migration membuat tabel single-row `maintenance_settings` dengan RLS.

## Cara memakai
1. Login Admin.
2. Buka **Admin → Maintenance Mode**.
3. Atur judul/pesan jika diperlukan.
4. Opsional isi jadwal mulai dan selesai.
5. Tekan **MAINTENANCE ON**.
6. Tekan **Simpan Pengaturan**.
7. Setelah selesai memperbaiki web, kembali ke halaman yang sama dan pilih **MAINTENANCE OFF**, lalu simpan.

## Catatan operasional
Maintenance gate tidak mematikan webhook pembayaran atau cron karena transaksi yang telah dibayar/berjalan harus tetap dapat diselesaikan. Endpoint customer API baru akan mendapatkan 503. Untuk operasi admin, bypass dilakukan berdasarkan role server-side.

## Verifikasi paket
- `npm test`: 80/80 passed.
- `npm run validate:migrations`: missing 0, errors 0.
- Warning lama: duplicate v5 migration dan gap versi historis.
- Full Next.js production build belum dijalankan pada paket ini karena `node_modules` tidak disertakan.
