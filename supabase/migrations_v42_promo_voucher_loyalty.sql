-- AIDIL STORE v42: Promo, Voucher & Loyalty
create extension if not exists pgcrypto;

create table if not exists public.promo_vouchers (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  discount_type text not null check (discount_type in ('FIXED','PERCENTAGE')),
  discount_value bigint not null check (discount_value >= 0),
  min_order_amount bigint not null default 0 check (min_order_amount >= 0),
  max_discount bigint,
  usage_limit integer,
  usage_per_user integer not null default 1 check (usage_per_user > 0),
  used_count integer not null default 0 check (used_count >= 0),
  starts_at timestamptz not null default now(), expires_at timestamptz,
  is_active boolean not null default true, categories text[] not null default '{}',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists promo_vouchers_active_idx on public.promo_vouchers(is_active, starts_at, expires_at);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(), voucher_id uuid not null references public.promo_vouchers(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade, order_id uuid references public.orders(id) on delete set null,
  discount_amount bigint not null check (discount_amount >= 0), created_at timestamptz not null default now(),
  unique(voucher_id, user_id, order_id)
);
create index if not exists promo_redemptions_user_idx on public.promo_redemptions(user_id, created_at desc);

create table if not exists public.loyalty_levels (
  id uuid primary key default gen_random_uuid(), name text not null unique, min_points bigint not null default 0 check (min_points >= 0), multiplier numeric(8,2) not null default 1 check (multiplier > 0), is_active boolean not null default true
);
insert into public.loyalty_levels(name,min_points,multiplier) values ('Bronze',0,1),('Silver',1000,1.10),('Gold',5000,1.25),('Platinum',15000,1.50) on conflict(name) do nothing;

create table if not exists public.loyalty_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade, points bigint not null default 0 check (points >= 0), lifetime_points bigint not null default 0 check (lifetime_points >= 0), level_id uuid references public.loyalty_levels(id), updated_at timestamptz not null default now()
);
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  points bigint not null, reason text not null, reference_type text, reference_id uuid, created_at timestamptz not null default now(),
  unique(user_id, reference_type, reference_id)
);

alter table public.promo_vouchers enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_ledger enable row level security;
alter table public.loyalty_levels enable row level security;

drop policy if exists promo_vouchers_public_read on public.promo_vouchers;
create policy promo_vouchers_public_read on public.promo_vouchers for select to authenticated using (is_active=true and starts_at<=now() and (expires_at is null or expires_at>now()));
drop policy if exists promo_redemptions_own on public.promo_redemptions;
create policy promo_redemptions_own on public.promo_redemptions for select to authenticated using (user_id=auth.uid() or public.is_admin());
drop policy if exists loyalty_accounts_own on public.loyalty_accounts;
create policy loyalty_accounts_own on public.loyalty_accounts for select to authenticated using (user_id=auth.uid() or public.is_admin());
drop policy if exists loyalty_ledger_own on public.loyalty_ledger;
create policy loyalty_ledger_own on public.loyalty_ledger for select to authenticated using (user_id=auth.uid() or public.is_admin());
drop policy if exists loyalty_levels_public_read on public.loyalty_levels;
create policy loyalty_levels_public_read on public.loyalty_levels for select to authenticated using (is_active=true or public.is_admin());

create or replace function public.validate_voucher(p_code text, p_order_amount bigint, p_user_id uuid default auth.uid())
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.promo_vouchers; used integer; discount bigint;
begin
 if p_user_id is null or p_user_id <> auth.uid() and not public.is_admin() then raise exception 'UNAUTHORIZED'; end if;
 select * into v from public.promo_vouchers where upper(code)=upper(trim(p_code)) and is_active=true and starts_at<=now() and (expires_at is null or expires_at>now()) for update;
 if not found then raise exception 'VOUCHER_INVALID'; end if;
 if v.usage_limit is not null and v.used_count>=v.usage_limit then raise exception 'VOUCHER_LIMIT'; end if;
 select count(*) into used from public.promo_redemptions where voucher_id=v.id and user_id=p_user_id;
 if used>=v.usage_per_user then raise exception 'VOUCHER_USER_LIMIT'; end if;
 if p_order_amount<v.min_order_amount then raise exception 'VOUCHER_MIN_ORDER'; end if;
 discount:=case when v.discount_type='PERCENTAGE' then floor(p_order_amount*v.discount_value/100.0) else v.discount_value end;
 if v.max_discount is not null then discount:=least(discount,v.max_discount); end if;
 discount:=least(discount,p_order_amount);
 return jsonb_build_object('valid',true,'voucher_id',v.id,'code',v.code,'discount',discount,'discount_type',v.discount_type,'discount_value',v.discount_value);
end $$;
revoke all on function public.validate_voucher(text,bigint,uuid) from public;
grant execute on function public.validate_voucher(text,bigint,uuid) to authenticated;

create or replace function public.redeem_voucher(p_voucher_id uuid,p_user_id uuid,p_order_id uuid,p_discount bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare v public.promo_vouchers; existing integer;
begin
 if auth.uid() is null or p_user_id<>auth.uid() then raise exception 'UNAUTHORIZED'; end if;
 select * into v from public.promo_vouchers where id=p_voucher_id for update;
 if not found or not v.is_active or v.starts_at>now() or (v.expires_at is not null and v.expires_at<=now()) then raise exception 'VOUCHER_INVALID'; end if;
 if v.usage_limit is not null and v.used_count>=v.usage_limit then raise exception 'VOUCHER_LIMIT'; end if;
 select count(*) into existing from public.promo_redemptions where voucher_id=v.id and user_id=p_user_id;
 if existing>=v.usage_per_user then raise exception 'VOUCHER_USER_LIMIT'; end if;
 insert into public.promo_redemptions(voucher_id,user_id,order_id,discount_amount) values(v.id,p_user_id,p_order_id,greatest(0,p_discount)) on conflict do nothing;
 if not found then return true; end if;
 update public.promo_vouchers set used_count=used_count+1,updated_at=now() where id=v.id;
 return true;
end $$;
revoke all on function public.redeem_voucher(uuid,uuid,uuid,bigint) from public;
grant execute on function public.redeem_voucher(uuid,uuid,uuid,bigint) to authenticated;

create or replace function public.award_loyalty_points(p_user_id uuid,p_points bigint,p_reason text,p_reference_type text,p_reference_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare lvl uuid;
begin
 if p_points<=0 then return true; end if;
 insert into public.loyalty_accounts(user_id) values(p_user_id) on conflict do nothing;
 insert into public.loyalty_ledger(user_id,points,reason,reference_type,reference_id) values(p_user_id,p_points,p_reason,p_reference_type,p_reference_id) on conflict(user_id,reference_type,reference_id) do nothing;
 if not found then return true; end if;
 update public.loyalty_accounts set points=points+p_points,lifetime_points=lifetime_points+p_points,updated_at=now() where user_id=p_user_id;
 select id into lvl from public.loyalty_levels where is_active and min_points <= (select lifetime_points from public.loyalty_accounts where user_id=p_user_id) order by min_points desc limit 1;
 update public.loyalty_accounts set level_id=lvl where user_id=p_user_id;
 return true;
end $$;
revoke all on function public.award_loyalty_points(uuid,bigint,text,text,uuid) from public;
grant execute on function public.award_loyalty_points(uuid,bigint,text,text,uuid) to authenticated;
