-- AIDIL STORE v70 — Reject KYC per tahap (KTP / Wajah terpisah) + kunci akses
-- kolom cost_price & margin di ppob_services agar tidak bisa dibaca langsung
-- lewat Supabase oleh siapa pun selain admin (service role).
-- Aman dijalankan setelah v69. Tidak ada data lama yang dihapus.

-- ============================================================
-- 1) KYC: admin bisa menolak Tahap 1 (KTP) atau Tahap 2 (Wajah) secara terpisah,
--    supaya user tidak perlu mengulang tahap yang sudah benar.
-- ============================================================
alter table public.kyc_verifications
  add column if not exists rejected_stage text check (rejected_stage in ('KTP','SELFIE'));

comment on column public.kyc_verifications.rejected_stage is
  'Diisi saat status=REJECTED untuk menandai tahap mana yang perlu diulang user. NULL = ulang kedua tahap (perilaku lama / penolakan umum).';

create or replace function public.admin_review_kyc(
  p_user_id uuid,
  p_status text,
  p_reason text default null,
  p_review_note text default null,
  p_rejected_stage text default null
)
returns public.kyc_verifications
language plpgsql security definer set search_path=public,extensions as $$
declare
  k public.kyc_verifications;
  display_name text;
  v_message text;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_status not in ('VERIFIED','REJECTED') then raise exception 'INVALID_KYC_STATUS'; end if;
  if p_rejected_stage is not null and p_rejected_stage not in ('KTP','SELFIE') then
    raise exception 'INVALID_REJECTED_STAGE';
  end if;

  update public.kyc_verifications
    set status=p_status,
        rejection_reason=case when p_status='REJECTED' then nullif(trim(coalesce(p_reason,'')),'') else null end,
        rejected_stage=case when p_status='REJECTED' then p_rejected_stage else null end,
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
    jsonb_build_object('status',p_status,'reason',p_reason,'review_note',p_review_note,'rejected_stage',p_rejected_stage));

  v_message := case
    when p_status='VERIFIED' then 'Akun kamu sudah terverifikasi sebagai Reseller.'
    when p_rejected_stage='KTP' then trim('Foto KTP ditolak, silakan ulangi Tahap 1 (foto wajah Tahap 2 tidak perlu diulang). ' || coalesce('Alasan: '||p_reason, ''))
    when p_rejected_stage='SELFIE' then trim('Verifikasi wajah ditolak, silakan ulangi Tahap 2 saja. ' || coalesce('Alasan: '||p_reason, ''))
    else trim('KYC ditolak, silakan ajukan ulang dari Tahap 1. ' || coalesce('Alasan: '||p_reason, ''))
  end;

  insert into public.notifications(user_id,title,message,reference_type,reference_id)
  values(
    p_user_id,
    case when p_status='VERIFIED' then 'KYC Diverifikasi' else 'KYC Ditolak' end,
    v_message,
    'kyc', p_user_id
  );

  return k;
end;
$$;

grant execute on function public.admin_review_kyc(uuid,text,text,text,text) to authenticated;

-- ============================================================
-- 2) Kunci kolom cost_price & margin di ppob_services.
--    Sebelumnya kebijakan RLS "ppob_services_public_active" mengizinkan siapa
--    saja membaca SEMUA kolom (termasuk cost_price/margin = modal) selama
--    provider_active=true. RLS bersifat per-baris, bukan per-kolom, jadi
--    perbaikannya lewat hak akses kolom Postgres: cabut SELECT penuh dari
--    anon/authenticated, lalu berikan lagi hanya untuk kolom yang aman untuk
--    ditampilkan ke publik. cost_price & margin sengaja TIDAK diberikan ke
--    anon/authenticated — hanya bisa dibaca lewat service role (createAdminClient()
--    di server), yang dipakai kode aplikasi untuk menghitung "Untung" di server.
-- ============================================================
revoke select on public.ppob_services from anon, authenticated;
grant select (
  id, product_id, provider, provider_sku, service_kind, category, brand,
  target_schema, provider_active, updated_at
) on public.ppob_services to anon, authenticated;
