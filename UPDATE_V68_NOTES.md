# V68 — Fix Header Kamera + CSP + Admin 2FA

## 1. Fix header kamera (`next.config.js`)
- `Permissions-Policy` diubah dari `camera=()` (blokir total) jadi `camera=(self)` — kamera untuk KYC sekarang bisa jalan.
- Ditambahkan `Strict-Transport-Security` (HSTS) juga sekalian, sebelumnya belum ada.

## 2. Content-Security-Policy (CSP)
- CSP baru ditambahkan di `next.config.js`, membatasi sumber script/style/gambar/koneksi hanya ke domain sendiri + Supabase + Resend (email).
- Catatan: masih pakai `'unsafe-inline' 'unsafe-eval'` di script-src karena Next.js App Router butuh itu tanpa setup nonce khusus. Ini tetap jauh lebih ketat dari sebelumnya (yang sama sekali tidak ada CSP), tapi kalau mau CSP paling ketat (nonce-based), butuh perubahan arsitektur (middleware nonce) — bisa saya kerjakan terpisah kalau mau.

## 3. Login Admin 2 Langkah (2FA email OTP)
Sekarang login admin **wajib 2 langkah**: password benar → lanjut masukkan kode OTP 6 digit yang dikirim ke email admin, baru bisa masuk dashboard.

File baru:
- `supabase/migrations_v68_admin_2fa.sql` — tabel `admin_login_otps` (harus dijalankan di Supabase SQL Editor sebelum deploy).
- `src/lib/security/admin-2fa.ts` — bikin & verifikasi cookie sesi 2FA (httpOnly, ditandatangani HMAC, berlaku 12 jam).
- `src/app/api/auth/admin/send-otp/route.ts` — kirim OTP (rate-limited 5x/15menit, cooldown kirim ulang 60 detik).
- `src/app/api/auth/admin/verify-otp/route.ts` — verifikasi OTP (rate-limited, maks 5x salah lalu harus minta OTP baru), lalu set cookie 2FA.

File diubah:
- `src/app/admin-login/page.tsx` — ada step OTP setelah password benar, termasuk auto-lanjut ke step OTP kalau user sudah login tapi belum verifikasi 2FA.
- `src/app/admin/layout.tsx` — sekarang cek cookie 2FA juga, bukan cuma role admin. Tanpa cookie valid, langsung dilempar balik ke `/admin-login` walau sesi Supabase-nya masih aktif.

## ⚠️ WAJIB dilakukan sebelum deploy
1. **Jalankan migration** `supabase/migrations_v68_admin_2fa.sql` di Supabase SQL Editor.
2. Pastikan `OTP_PEPPER`, `RESEND_API_KEY`, dan `EMAIL_FROM` sudah terisi di environment produksi — tanpa ini, OTP admin tidak bisa dikirim di production (di development, OTP tampil di console log server).
3. Test alur login admin: password → cek email → masukkan OTP → masuk dashboard.
