-- AIDIL STORE v69 — KYC bertahap (Tahap 1: KTP, Tahap 2: Verifikasi Wajah)
-- Aman dijalankan setelah v68. Tidak ada kolom lama yang dihapus.
-- Tahap 1 (KTP) disimpan segera setelah foto lolos cek kualitas, lalu user lanjut ke Tahap 2 (wajah).
-- Status akhir 'SUBMITTED' baru tercapai setelah kedua tahap selesai dan masuk antrean review admin.

alter table public.kyc_verifications drop constraint if exists kyc_verifications_status_check;
alter table public.kyc_verifications
  add constraint kyc_verifications_status_check
  check (status in ('PENDING','KTP_SUBMITTED','SUBMITTED','VERIFIED','REJECTED'));

alter table public.kyc_verifications
  add column if not exists ktp_saved_at timestamptz;

drop policy if exists kyc_owner_insert on public.kyc_verifications;
create policy kyc_owner_insert on public.kyc_verifications
for insert to authenticated
with check (auth.uid() = user_id and status in ('PENDING','KTP_SUBMITTED','SUBMITTED'));

drop policy if exists kyc_owner_update on public.kyc_verifications;
create policy kyc_owner_update on public.kyc_verifications
for update to authenticated
using (auth.uid() = user_id and status in ('PENDING','KTP_SUBMITTED','SUBMITTED','REJECTED'))
with check (auth.uid() = user_id and status in ('PENDING','KTP_SUBMITTED','SUBMITTED'));

comment on column public.kyc_verifications.ktp_saved_at is 'Waktu Tahap 1 (KTP) tersimpan, sebelum user lanjut ke Tahap 2 (verifikasi wajah).';
