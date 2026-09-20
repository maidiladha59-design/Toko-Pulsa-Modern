# AIDIL STORE V66 — Panduan Instalasi & Perbaikan UI

## 1. Instalasi
```bash
npm install
npm run dev
```

## 2. Supabase
Pastikan migration yang sudah dipakai versi sebelumnya tetap dijalankan. Untuk OTP, tabel `email_verification_otps` wajib tersedia.

## 3. OTP Email
Development lokal menampilkan OTP di terminal jika `RESEND_API_KEY` dan `EMAIL_FROM` belum diisi.
Production membutuhkan:
```env
RESEND_API_KEY=ISI_API_KEY_RESEND
EMAIL_FROM=AIDIL STORE <noreply@domain-kamu>
```
Jangan masukkan secret ke GitHub.

## 4. Kamera
- Scan QRIS meminta izin kamera sebelum scanner aktif.
- KYC memiliki tombol izin kamera dan pengambilan foto KTP/selfie.
- Browser/perangkat tetap dapat menolak izin; pengguna harus mengaktifkannya kembali pada pengaturan browser/perangkat.

## 5. Bluetooth
Halaman struk menyediakan tombol `Cetak via Bluetooth`. Browser akan meminta pengguna memilih perangkat Bluetooth. Pencetakan ESC/POS otomatis bergantung pada printer yang mengekspos kanal GATT tulis yang kompatibel.

## 6. Pakasir
Tetap gunakan Sandbox selama pengujian. Jangan memasukkan API key ke source code.

## 7. Tema
Logo terbaru berada di `public/aidil-logo.png`. Tema UI utama menggunakan ungu, kuning, dan hitam.
