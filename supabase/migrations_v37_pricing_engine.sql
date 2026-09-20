-- AIDIL STORE v37 - Harga & Biaya Transaksi
-- Jalankan setelah v36.
-- Menambahkan rule harga berjenjang: GLOBAL -> CATEGORY -> BRAND -> SKU.

create table if not exists public.ppob_pricing_rules (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  scope_type text not null check (scope_type in ('GLOBAL','CATEGORY','BRAND','SKU')),
  scope_key text not null,
  fee_type text not null check (fee_type in ('FIXED','PERCENTAGE')),
  fee_value bigint not null default 0 check (fee_value >= 0),
  min_fee bigint,
  max_fee bigint,
  min_amount bigint not null default 0 check (min_amount >= 0),
  max_amount bigint,
  priority integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ppob_pricing_rules_lookup_idx
  on public.ppob_pricing_rules(is_active, scope_type, scope_key, priority desc);

alter table public.ppob_services add column if not exists provider_admin bigint not null default 0;
alter table public.ppob_services add column if not exists provider_selling_price bigint not null default 0;
alter table public.ppob_services add column if not exists pricing_rule_id uuid references public.ppob_pricing_rules(id);

alter table public.ppob_inquiries add column if not exists aidil_fee bigint not null default 0;
alter table public.ppob_inquiries add column if not exists pricing_rule_id uuid references public.ppob_pricing_rules(id);

alter table public.ppob_pricing_rules enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ppob_pricing_rules' and policyname='pricing_rules_admin') then
    create policy "pricing_rules_admin" on public.ppob_pricing_rules
      for all using (is_admin()) with check (is_admin());
  end if;
end $$;

create or replace function public.calculate_ppob_fee(
  p_amount bigint,
  p_fee_type text,
  p_fee_value bigint,
  p_min_fee bigint default null,
  p_max_fee bigint default null
) returns bigint
language plpgsql immutable as $$
declare v_fee bigint;
begin
  if p_amount <= 0 or p_fee_value <= 0 then return 0; end if;
  if upper(p_fee_type) = 'PERCENTAGE' then
    v_fee := round((p_amount::numeric * p_fee_value::numeric) / 100.0);
  else
    v_fee := p_fee_value;
  end if;
  if p_min_fee is not null then v_fee := greatest(v_fee,p_min_fee); end if;
  if p_max_fee is not null then v_fee := least(v_fee,p_max_fee); end if;
  return greatest(v_fee,0);
end $$;

insert into public.ppob_pricing_rules(name,scope_type,scope_key,fee_type,fee_value,priority)
select 'Default AIDIL STORE','GLOBAL','*','FIXED',0,0
where not exists (select 1 from public.ppob_pricing_rules where scope_type='GLOBAL' and scope_key='*');
