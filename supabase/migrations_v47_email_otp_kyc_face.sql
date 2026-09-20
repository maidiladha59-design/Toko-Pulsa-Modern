-- AIDIL STORE v47 — Email OTP only + stronger KYC (KTP + selfie/face review)
-- Safe to run after v46. No existing KYC columns are removed.

alter table public.kyc_verifications
  add column if not exists selfie_path text,
  add column if not exists kyc_method text not null default 'KTP_SELFIE' check (kyc_method in ('KTP_SELFIE')),
  add column if not exists review_note text,
  add column if not exists submitted_at timestamptz;

-- Keep old KK data nullable for backward compatibility, but new submissions use KTP + selfie.
create index if not exists kyc_verifications_status_submitted_idx
  on public.kyc_verifications(status, submitted_at desc);

-- Only admins can review KYC. A verified KYC turns the account into Reseller and notifies the customer.
create or replace function public.admin_review_kyc(
  p_user_id uuid,
  p_status text,
  p_reason text default null,
  p_review_note text default null
)
returns public.kyc_verifications
language plpgsql security definer set search_path=public,extensions as $$
declare
  k public.kyc_verifications;
  display_name text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_status not in ('VERIFIED','REJECTED') then raise exception 'INVALID_KYC_STATUS'; end if;

  update public.kyc_verifications
    set status=p_status,
        rejection_reason=case when p_status='REJECTED' then nullif(trim(coalesce(p_reason,'')),'') else null end,
        review_note=nullif(trim(coalesce(p_review_note,'')),''),
        reviewed_at=now(),
        reviewed_by=auth.uid(),
        updated_at=now()
  where user_id=p_user_id
  returning * into k;

  if not found then raise exception 'KYC_NOT_FOUND'; end if;

  update public.profiles
    set account_type=case when p_status='VERIFIED' then 'RESELLER' else 'CUSTOMER' end,
        updated_at=now()
  where id=p_user_id;

  select coalesce(full_name,'Pengguna') into display_name from public.profiles where id=p_user_id;

  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'kyc.review','user',p_user_id,
    jsonb_build_object('status',p_status,'reason',p_reason,'review_note',p_review_note));

  insert into public.notifications(user_id,title,message,reference_type,reference_id)
  values(
    p_user_id,
    case when p_status='VERIFIED' then 'KYC Berhasil Diverifikasi' else 'KYC Perlu Diperbaiki' end,
    case when p_status='VERIFIED'
      then 'Selamat, akun kamu sudah terverifikasi dan resmi menjadi Reseller. Layanan yang membutuhkan KYC sekarang dapat digunakan.'
      else 'Pengajuan KYC kamu belum dapat diverifikasi. Silakan periksa alasan penolakan dan ajukan kembali setelah memperbaiki data/dokumen.'
    end,
    'kyc',k.user_id
  );

  return k;
end $$;

revoke all on function public.admin_review_kyc(uuid,text,text,text) from public,anon;
grant execute on function public.admin_review_kyc(uuid,text,text,text) to authenticated,service_role;

-- Make the one-owner KYC storage policy support KTP and selfie without exposing the bucket publicly.
-- Existing private-bucket policies remain in place.

drop policy if exists kyc_owner_insert on public.kyc_verifications;
create policy kyc_owner_insert on public.kyc_verifications
for insert to authenticated
with check (auth.uid()=user_id and status in ('PENDING','SUBMITTED'));

drop policy if exists kyc_owner_update on public.kyc_verifications;
create policy kyc_owner_update on public.kyc_verifications
for update to authenticated
using (auth.uid()=user_id and status in ('PENDING','SUBMITTED','REJECTED'))
with check (auth.uid()=user_id and status in ('PENDING','SUBMITTED'));
