# AIDIL STORE V69 — KYC Bertahap, Bersihkan Scan QRIS, Rincian Transaksi Lengkap

## 1. KYC bertahap (Tahap 1: KTP → Tahap 2: Verifikasi Wajah)
- `src/app/kyc/page.tsx` ditulis ulang total: sekarang dua tahap terpisah.
  - **Tahap 1 — Scan KTP**: user difoto/upload KTP → sistem cek blur → jika bagus, **langsung disimpan** ke storage + `kyc_verifications` dengan status `KTP_SUBMITTED`. User otomatis lanjut ke Tahap 2.
  - **Tahap 2 — Verifikasi Wajah**: user difoto sesuai panduan oval di layar → cek blur → simpan sebagai `selfie_path`, status berubah jadi `SUBMITTED` (baru masuk antrean review admin).
- Setiap tahap punya **panduan pose bergambar** (ilustrasi SVG bawaan, tanpa perlu file gambar eksternal):
  - Tahap KTP: bingkai dengan 4 sudut penanda + contoh posisi kartu rata.
  - Tahap Wajah: oval panduan + overlay oval yang sama muncul langsung di atas preview kamera saat live.
- Indikator langkah (1 → 2) ditampilkan di atas form.
- `supabase/migrations_v69_kyc_staged_verification.sql` — migrasi baru: menambah status `KTP_SUBMITTED` pada constraint `kyc_verifications`, kolom `ktp_saved_at`, dan memperbarui RLS insert/update agar mengizinkan status tersebut. **Wajib dijalankan di Supabase sebelum deploy.**
- `src/app/api/admin/kyc/route.ts` — daftar admin KYC kini menyembunyikan baris yang baru sampai `KTP_SUBMITTED` (belum lengkap 2 tahap), supaya admin hanya melihat pengajuan yang benar-benar siap direview.

## 2. Scan QRIS — hapus upload/pilih gambar
- `src/app/scan-qris/page.tsx`: bagian **"Atau pilih gambar QRIS"** (input file) dan fungsi `chooseImage` dihapus. Sekarang scan QRIS hanya lewat kamera langsung.

## 3. Rincian transaksi lengkap (sesuai contoh struk)
- `src/app/orders/[id]/receipt/page.tsx`: struk sekarang menampilkan Tanggal, ID Transaksi, **Produk**, **Nomor Pelanggan**, Status, **SN/Ref**, **Harga Jual**, **Untung**, dan total **Harga** — format angka polos ala struk PPOB (mis. `18.766`, tanpa "Rp").
- `src/app/orders/[id]/page.tsx`: kartu status PPOB di halaman detail pesanan diperluas dengan field yang sama (Nomor Pelanggan, Status, Harga Jual, Untung, SN/Ref).
- "Untung" dihitung dari `ppob_services.cost_price` (modal) dikurangkan dari harga jual per item, mengikuti logika yang sama dengan dashboard finansial admin.

## Yang perlu dilakukan setelah extract
1. Jalankan migrasi `supabase/migrations_v69_kyc_staged_verification.sql` di Supabase SQL editor.
2. Deploy ulang seperti biasa (`npm run build` lalu deploy ke Vercel).

## Catatan / hal yang perlu diperhatikan
- **Test lama diperbarui**: `tests/production/email-otp-kyc-v47.test.mjs` sebelumnya mengecek pola kode KYC versi lama (single-step). Sudah disesuaikan agar cocok dengan flow dua tahap yang baru.
- **"Simpan kalo hasil sudah bagus" = cek blur saja**, bukan verifikasi keaslian KTP (OCR/pencocokan data). Kalau butuh validasi lebih ketat (nama/NIK terbaca dsb.), itu di luar cakupan perubahan ini dan perlu integrasi OCR terpisah.
- **Jika KYC ditolak admin**, user harus mengulang **kedua tahap** (KTP + wajah) dari awal — belum dipisah per-tahap alasan penolakannya.
- **RLS `ppob_services` sudah lama mengizinkan SELECT `cost_price` untuk siapa saja** (bukan cuma admin) selama `provider_active=true` — lihat `ppob_services_public_active` di `migrations_v9_ppob_engine.sql`. Ini bukan perubahan baru dari saya, tapi jadi lebih relevan sekarang karena "Untung" ditampilkan di struk/detail transaksi. Kalau tidak mau field modal/untung bisa diakses lewat query langsung ke Supabase oleh user teknis, sebaiknya kolom `cost_price` dipisah ke tabel/kebijakan yang hanya bisa dibaca admin, atau nilai "Untung" dihitung di API server (service role) alih-alih dihitung dari data yang bisa diquery client.
