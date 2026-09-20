# AIDIL STORE v71 — Cek OCR NIK/Kata Kunci KTP di Tahap 1

Lanjutan dari catatan ketiga di V69/V70: "Simpan kalau hasil bagus" cuma cek
blur, bukan verifikasi keaslian KTP. Ini bukan diskusi vendor dulu — karena
Anda bilang "lanjutkan" tanpa memilih vendor, saya pakai **default paling
aman**: OCR open-source (`tesseract.js`), **gratis, tanpa API key/akun pihak
ketiga**, jalan di server sendiri. Kalau nanti Anda mau ganti ke layanan
verifikasi KTP berbayar yang lebih akurat (baca wajah-KTP, cek hologram,
dsb.), bagian ini bisa diganti — strukturnya sudah dipisah di satu file
(`src/lib/ktp-ocr.ts`) supaya gampang di-swap.

## Apa yang berubah
- **`src/lib/ktp-ocr.ts`** (baru): fungsi `ocrKtp()` — baca teks dari foto
  KTP pakai `tesseract.js`, lalu cek pola NIK (16 digit) dan/atau kata kunci
  KTP ("NIK", "PROVINSI", "REPUBLIK INDONESIA", dst).
- **`src/app/api/kyc/verify-ktp/route.ts`** (baru): endpoint yang dipanggil
  halaman KYC sebelum menyimpan foto Tahap 1.
- **`src/app/kyc/page.tsx`**: setelah cek blur lolos (khusus Tahap 1/KTP),
  foto dikirim ke endpoint di atas. Kalau OCR **berhasil jalan** tapi **sama
  sekali tidak menemukan pola KTP**, foto ditolak dengan pesan jelas dan user
  diminta foto ulang. NIK yang kebaca disimpan ke kolom `ocr_nik` untuk
  bantuan admin.
- **`src/app/admin/kyc/page.tsx`** & **`api/admin/kyc/route.ts`**: baris KYC
  sekarang menampilkan "NIK (baca OCR otomatis, bukan verifikasi resmi)" di
  samping foto, supaya admin bisa membandingkan dengan yang terlihat di foto
  KTP saat review manual.
- **`supabase/migrations_v71_kyc_ocr_nik.sql`**: kolom baru `ocr_nik`.
- **`package.json`**: tambah dependency `tesseract.js`.

## Batasan penting yang harus Anda tahu
- **Ini BUKAN verifikasi keaslian resmi.** Tidak ada pengecekan ke Dukcapil,
  tidak mendeteksi KTP hasil edit/palsu yang teksnya tetap terbaca, dan tidak
  ada pencocokan wajah dengan foto KTP. Ini murni "apakah foto ini *terbaca*
  seperti KTP" — jauh lebih ketat dari cek blur saja, tapi tetap bukan
  verifikasi identitas penuh.
- **Fail-open by design**: kalau proses OCR-nya sendiri gagal/error (server
  bermasalah, dsb.), foto tetap diloloskan ke tahap simpan — supaya KYC tidak
  macet total hanya gara-gara OCR bermasalah. Yang benar-benar diblokir hanya
  kalau OCR berhasil jalan tapi hasilnya sama sekali tidak terlihat seperti
  KTP (foto acak, foto blur ekstrem yang lolos cek blur, dsb.)
- **Belum saya uji jalan di lingkungan Anda** — sandbox saya tidak punya
  akses internet untuk `npm install` dan build project ini. `tesseract.js`
  adalah paket yang umum dipakai dan seharusnya jalan normal di Next.js App
  Router (Node runtime, sudah saya set `export const runtime = "nodejs"`),
  tapi **tolong jalankan `npm install && npm run build` dan tes upload KTP
  sungguhan di lingkungan Anda sebelum deploy ke production**.
- **Performa**: permintaan OCR pertama di server bisa terasa lebih lambat
  karena `tesseract.js` mengunduh file bahasa (~beberapa MB) saat pertama
  kali dipakai. Kalau fungsi server Anda "dingin" tiap request (serverless
  tanpa cache persisten), ini bisa terasa berulang. Kalau nanti terasa
  lambat/mahal, opsi selanjutnya: cache file bahasa di storage sendiri, atau
  ganti ke layanan OCR/verifikasi KTP berbayar yang lebih cepat & akurat.

## Setelah extract
1. Jalankan `supabase/migrations_v71_kyc_ocr_nik.sql` di SQL editor Supabase
   (setelah v69 dan v70).
2. `npm install` (menambah `tesseract.js`), lalu `npm run build` — **cek dulu
   di lingkungan Anda**, ini bagian yang belum saya tes langsung.
3. Deploy ulang seperti biasa.
