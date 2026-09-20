-- AIDIL STORE v46 — Customer experience, auth gating, KYC/account type,
-- configurable gateway methods, one-active-topup rule and editable FAQ.

alter table public.profiles add column if not exists account_type text not null default 'CUSTOMER' check (account_type in ('CUSTOMER','RESELLER'));
alter table public.profiles add column if not exists phone_verified_at timestamptz;
create index if not exists profiles_account_type_idx on public.profiles(account_type);

-- Phone captured at signup is copied into the profile; verified phone is tracked separately.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
  insert into public.profiles (id,email,full_name,phone)
  values (new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),nullif(new.raw_user_meta_data->>'phone',''))
  on conflict (id) do update set email=excluded.email, full_name=coalesce(excluded.full_name,profiles.full_name), phone=coalesce(excluded.phone,profiles.phone);
  insert into public.wallets (user_id,balance) values (new.id,0) on conflict(user_id) do nothing;
  return new;
end;
$$;

-- Only one unpaid/unfinished automatic top-up may exist per customer.
create unique index if not exists topups_one_active_per_user_idx
on public.topups(user_id)
where status in ('PENDING','VERIFYING');

create or replace function public.cancel_own_topup(p_topup_id uuid)
returns public.topups
language plpgsql security definer set search_path=public,extensions as $$
declare t public.topups;
begin
  select * into t from public.topups where id=p_topup_id and user_id=auth.uid() for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if t.status not in ('PENDING','VERIFYING') then raise exception 'TOPUP_NOT_CANCELLABLE'; end if;
  update public.topups set status='CANCELLED',updated_at=now() where id=t.id returning * into t;
  return t;
end $$;
revoke all on function public.cancel_own_topup(uuid) from public,anon;
grant execute on function public.cancel_own_topup(uuid) to authenticated;

create or replace function public.expire_own_topup_if_needed(p_topup_id uuid)
returns public.topups
language plpgsql security definer set search_path=public,extensions as $$
declare t public.topups;
begin
  select * into t from public.topups where id=p_topup_id and user_id=auth.uid() for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if t.status in ('PENDING','VERIFYING') and t.expires_at is not null and t.expires_at <= now() then
    update public.topups set status='EXPIRED',updated_at=now() where id=t.id returning * into t;
  end if;
  return t;
end $$;
revoke all on function public.expire_own_topup_if_needed(uuid) from public,anon;
grant execute on function public.expire_own_topup_if_needed(uuid) to authenticated;

-- Admin-configurable labels/order for methods that are actually supported by Pakasir.
create table if not exists public.topup_payment_methods (
  provider_method text primary key,
  label text not null,
  description text,
  payment_type text not null default 'VA' check(payment_type in ('QRIS','VA')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.topup_payment_methods(provider_method,label,description,payment_type,sort_order) values
('qris','QRIS','Bayar dengan aplikasi yang mendukung QRIS.','QRIS',10),
('bri_va','BRI Virtual Account','Bayar melalui BRI atau kanal yang mendukung BRI VA.','VA',20),
('bni_va','BNI Virtual Account','Bayar melalui BNI atau kanal yang mendukung BNI VA.','VA',30),
('cimb_niaga_va','CIMB Niaga Virtual Account','Bayar melalui CIMB Niaga.','VA',40),
('permata_va','Permata Virtual Account','Bayar melalui Permata.','VA',50),
('maybank_va','Maybank Virtual Account','Bayar melalui Maybank.','VA',60),
('bnc_va','BNC Virtual Account','Bayar melalui Bank Neo Commerce.','VA',70),
('sampoerna_va','Sampoerna Virtual Account','Bayar melalui kanal Sampoerna VA.','VA',80),
('atm_bersama_va','ATM Bersama Virtual Account','Bayar melalui jaringan ATM Bersama.','VA',90),
('artha_graha_va','Artha Graha Virtual Account','Bayar melalui Artha Graha.','VA',100)
on conflict(provider_method) do nothing;
alter table public.topup_payment_methods enable row level security;
drop policy if exists topup_payment_methods_active_select on public.topup_payment_methods;
create policy topup_payment_methods_active_select on public.topup_payment_methods for select using(is_active=true or public.is_admin());
drop policy if exists topup_payment_methods_admin_write on public.topup_payment_methods;
create policy topup_payment_methods_admin_write on public.topup_payment_methods for all using(public.is_admin()) with check(public.is_admin());

-- FAQ editable by admins.
create table if not exists public.faqs (
  id uuid primary key default extensions.uuid_generate_v4(),
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.faqs(question,answer,sort_order) values
('Bagaimana Top Up saldo?','Pilih nominal, pilih metode pembayaran, lalu selesaikan pembayaran sebelum batas waktu. Saldo akan dikreditkan otomatis setelah gateway terverifikasi.',10),
('Mengapa saya tidak bisa membuat Top Up baru?','AIDIL STORE hanya mengizinkan satu Top Up yang masih menunggu pembayaran. Selesaikan atau batalkan Top Up sebelumnya terlebih dahulu.',20),
('Bagaimana KYC dan jenis akun?','Akun baru berstatus Pelanggan. Setelah dokumen KYC diverifikasi admin, jenis akun berubah menjadi Reseller dan layanan yang mensyaratkan KYC dapat digunakan.',30),
('Bagaimana transaksi PPOB diproses?','Masukkan tujuan yang benar, pilih metode pembayaran, lalu sistem memproses transaksi melalui provider PPOB. Status dan hasil dapat dilihat di Transaksi.',40)
on conflict do nothing;
alter table public.faqs enable row level security;
drop policy if exists faqs_public_select on public.faqs;
create policy faqs_public_select on public.faqs for select using(is_active=true or public.is_admin());
drop policy if exists faqs_admin_write on public.faqs;
create policy faqs_admin_write on public.faqs for all using(public.is_admin()) with check(public.is_admin());

-- KYC approval controls account type. Admin-only mutation.
create or replace function public.admin_review_kyc(p_user_id uuid,p_status text,p_reason text default null)
returns public.kyc_verifications
language plpgsql security definer set search_path=public,extensions as $$
declare k public.kyc_verifications;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_status not in ('VERIFIED','REJECTED') then raise exception 'INVALID_KYC_STATUS'; end if;
  update public.kyc_verifications
  set status=p_status,rejection_reason=case when p_status='REJECTED' then nullif(trim(coalesce(p_reason,'')),'') else null end,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now()
  where user_id=p_user_id returning * into k;
  if not found then raise exception 'KYC_NOT_FOUND'; end if;
  update public.profiles set account_type=case when p_status='VERIFIED' then 'RESELLER' else 'CUSTOMER' end,updated_at=now() where id=p_user_id;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'kyc.review','user',p_user_id,jsonb_build_object('status',p_status,'reason',p_reason));
  return k;
end $$;
revoke all on function public.admin_review_kyc(uuid,text,text) from public,anon;
grant execute on function public.admin_review_kyc(uuid,text,text) to authenticated,service_role;

-- Verification helper for restricted services.
create or replace function public.is_kyc_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=p_user_id and account_type='RESELLER')
$$;
revoke all on function public.is_kyc_verified(uuid) from public,anon;
grant execute on function public.is_kyc_verified(uuid) to authenticated,service_role;
create unique index if not exists profiles_phone_unique_idx on public.profiles(phone) where phone is not null and length(trim(phone))>0;
create unique index if not exists faqs_question_unique_idx on public.faqs(lower(trim(question)));
update public.profiles p set account_type='RESELLER',updated_at=now() where exists(select 1 from public.kyc_verifications k where k.user_id=p.id and k.status='VERIFIED');
create unique index if not exists profiles_email_unique_idx on public.profiles(lower(trim(email)));
