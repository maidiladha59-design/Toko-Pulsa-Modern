# AIDIL STORE V66 — UI & UX Redesign

- Logo AIDIL STORE diperbarui menggunakan aset logo terbaru.
- Tema visual diperbarui menjadi ungu, kuning, dan hitam.
- Kalkulator dipindahkan dari Beranda ke `/calculator` dan ditambahkan ke navigasi.
- Halaman Top Up dibuat seperti halaman rincian pembayaran: nominal, biaya, total, nomor pembayaran/QRIS, batas waktu, instruksi, dan status.
- Halaman rincian transaksi/struk diperbarui dengan struktur rapi dan tombol cetak.
- Tombol cetak menyediakan permintaan izin Web Bluetooth jika browser mendukung; pencetakan aktual tetap bergantung pada dukungan printer/browser.
- Scan QRIS meminta izin kamera secara eksplisit sebelum membuka scanner.
- KYC menyediakan permintaan izin kamera dan pengambilan foto KTP/selfie melalui kamera.
- Realtime Notifications diperbaiki agar callback dipasang sebelum `subscribe()`.
- Endpoint pengiriman OTP diperbaiki agar pemeriksaan user lebih tepat dan pesan error lebih informatif.

## Catatan OTP
OTP development tetap dicetak pada terminal server. Untuk OTP yang benar-benar terkirim melalui email pada production, SMTP/email provider harus dikonfigurasi pada Supabase/Auth atau provider email yang digunakan.
