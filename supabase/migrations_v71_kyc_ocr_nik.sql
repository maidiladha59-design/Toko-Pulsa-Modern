-- AIDIL STORE v71 — kolom hasil baca OCR otomatis (NIK) untuk KYC Tahap 1.
-- Aman dijalankan setelah v70. Bukan verifikasi keaslian resmi (Dukcapil dll) —
-- hanya bantuan pembacaan otomatis untuk mempercepat review manual admin.

alter table public.kyc_verifications
  add column if not exists ocr_nik text;

comment on column public.kyc_verifications.ocr_nik is
  'NIK (16 digit) hasil pembacaan OCR otomatis saat submit foto KTP. Best-effort, bisa kosong/salah baca. Bukan verifikasi resmi ke Dukcapil — hanya membantu admin saat review manual.';
