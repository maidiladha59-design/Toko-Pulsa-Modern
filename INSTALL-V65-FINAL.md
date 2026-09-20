# AIDIL STORE V65 FINAL

Versi gabungan: onboarding + OTP + sesi 7 hari + top up deadline 10 menit + broadcast + Web Push + Notification Engine + ranking + kalkulator.

## 1. Install dependency

Di root project:

```bash
npm install web-push @types/web-push
```

Jika `package-lock.json` ada, perintah ini akan menyinkronkan lockfile.

## 2. Environment

Jangan menyalin `.env.local` dari project/ZIP lain.

Pastikan production memiliki:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:email-kamu@example.com
OTP_PEPPER=secret-random-panjang
CRON_SECRET=secret-random-panjang
```

`VAPID_PRIVATE_KEY` dan secret lain hanya server-side.

## 3. Supabase migrations

Jalankan migration yang belum pernah dijalankan, mengikuti urutan versi:

- `supabase/migrations_v59_onboarding_session_topup_deadline.sql`
- `supabase/migrations_v60_admin_broadcast_notifications.sql`
- `supabase/supabase-migrations-v61-web-push.sql`
- `supabase/supabase-migrations-v62-notification-engine.sql`
- `supabase/supabase-migrations-v63-notification-integration.sql`
- `supabase/migrations_v65_rankings.sql`

Jangan menjalankan migration yang sama berulang kali jika sudah berhasil dijalankan.

## 4. Ranking

Ranking hanya menghitung `orders.status = COMPLETED`.
FAILED/CANCELLED/REFUNDED tidak dihitung.

Tie-breaker: jumlah transaksi berhasil, lalu total nilai transaksi berhasil, lalu user_id.

Cron ranking sudah ditambahkan ke `vercel.json`:

`/api/rankings/cron` setiap 2 menit.

Pastikan `CRON_SECRET` tersedia di Vercel.

## 5. Beranda

`src/app/page.tsx` sudah diubah langsung untuk menampilkan:

- RankingHomeCard
- HomeCalculator

Tidak perlu menempelkan import atau JSX secara manual.

## 6. Web Push

Pastikan HTTPS aktif pada domain production (misalnya custom domain Vercel).
Pengguna tetap harus memberikan izin notifikasi pada browser/perangkat.

## 7. Security

Endpoint publik notification event yang dapat memalsukan event telah dihapus pada V64.
Event notifikasi penting harus dipicu dari server setelah operasi bisnis benar-benar berhasil.
