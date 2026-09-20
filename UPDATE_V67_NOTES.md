# V67 — Update: Gold+Black Theme, KYC Anti-Blur, Audit QRIS

## 1. Tema warna: kuning emas + hitam di seluruh halaman
- `tailwind.config.ts`: warna `gold` sekarang skala penuh (50–950), `brand` & `navy` diarahkan ke emas/hitam.
- `src/app/globals.css`: seluruh warna dasar (background, border kartu, hero, navbar, tombol, footer) diubah dari ungu/biru ke kombinasi emas (#F5C542/#D4AF37) + hitam (#09090b).
- 313 kelas Tailwind (biru, indigo, ungu, violet, sky, cyan) di 49 file otomatis dipetakan ke skala emas/zinc-hitam agar konsisten di semua halaman (home, dashboard, checkout, admin, dst).
- Template email OTP juga disesuaikan ke gold+hitam.

## 2. KYC — deteksi blur otomatis (WAJIB, foto blur DITOLAK)
- File baru: `src/lib/blur-check.ts` — menghitung skor ketajaman gambar (varian Laplacian) langsung di browser, tanpa perlu server.
- `src/app/kyc/page.tsx`:
  - Saat foto diambil dari kamera (`capture()`) maupun dipilih dari file (`handleFile()`), sistem otomatis mengecek blur sebelum foto diterima.
  - Jika terdeteksi blur → foto otomatis ditolak, muncul toast merah: "Foto terlalu blur/buram... Foto blur tidak akan diterima." dan user harus mengambil ulang.
  - Ditambahkan banner peringatan permanen di halaman KYC (sebelum submit) yang mengingatkan foto tidak boleh blur.
  - Threshold sharpness ada di `BLUR_VARIANCE_THRESHOLD` (default 45) di `src/lib/blur-check.ts` — naikkan angka ini kalau ingin lebih ketat, turunkan kalau terlalu sering menolak foto yang sebenarnya cukup jelas.

## 3. QRIS — audit auto-deteksi pembayaran
Sudah diperiksa, dan alur auto-deteksinya **sudah benar dan berjalan otomatis**:
- `src/components/QrisPayment.tsx` polling status order tiap 4 detik ke `/api/orders/[id]/status`.
- `src/app/api/payments/pakasir/webhook/route.ts` menerima callback dari Pakasir, memverifikasi ulang ke Transaction Detail API (bukan cuma percaya payload webhook), lalu otomatis konfirmasi pembayaran (idempotent — dicek dulu status order & event key supaya tidak diproses dua kali) dan langsung fulfill order.
- Tidak ada perubahan kode di bagian ini karena logikanya sudah tepat. Yang perlu dipastikan di sisi hosting/produksi: URL webhook Pakasir di dashboard Pakasir harus mengarah ke `https://domainkamu.com/api/payments/pakasir/webhook`, dan `PAKASIR_PROJECT` + API key di `.env` harus terisi benar — kalau itu tidak diset, webhook auto-skip (tidak error, tapi juga tidak mengonfirmasi apa pun).

## Catatan build
Saya tidak bisa menjalankan `next build` penuh di lingkungan kerja ini karena tidak ada akses internet untuk mengunduh binary SWC Next.js. Saya sudah menjalankan `tsc --noEmit` ke seluruh project dan tidak ada error TypeScript baru (hanya 1 peringatan lama soal import CSS di `layout.tsx` yang normal untuk proyek Next.js dan tidak memengaruhi build sungguhan). Disarankan jalankan `npm run build` sendiri di komputer/servermu yang online sebelum deploy, untuk memastikan 100% aman.
