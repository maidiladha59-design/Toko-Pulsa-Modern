-- AIDIL STORE v35 — Configurable Top Up Fee
-- Apply after v34. Do NOT rerun schema.sql.

create table if not exists public.topup_fee_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  fee_type text not null default 'FIXED' check (fee_type in ('FIXED','PERCENTAGE')),
  fee_value numeric(12,4) not null default 0 check (fee_value >= 0),
  min_topup bigint not null default 10000 check (min_topup > 0),
  max_topup bigint not null default 10000000 check (max_topup >= min_topup),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.topup_fee_settings (id, enabled, fee_type, fee_value, min_topup, max_topup)
values (1, true, 'FIXED', 0, 10000, 10000000)
on conflict (id) do nothing;

alter table public.topups
  add column if not exists admin_fee bigint not null default 0,
  add column if not exists payment_amount bigint,
  add column if not exists fee_type text,
  add column if not exists fee_rate numeric(12,4);

update public.topups
set payment_amount = coalesce(payment_amount, amount + coalesce(admin_fee,0))
where payment_amount is null;

alter table public.topups
  add constraint topups_admin_fee_nonnegative_chk check (admin_fee >= 0);

alter table public.topups
  add constraint topups_payment_amount_positive_chk check (payment_amount is null or payment_amount > 0);

create index if not exists topups_provider_status_idx on public.topups(provider, status, created_at desc);

alter table public.topup_fee_settings enable row level security;

revoke all on public.topup_fee_settings from anon, authenticated;
grant select on public.topup_fee_settings to authenticated;

drop policy if exists "topup_fee_settings_admin_read" on public.topup_fee_settings;
create policy "topup_fee_settings_admin_read"
on public.topup_fee_settings
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN')
  )
);

create or replace function public.get_topup_fee_config()
returns table (
  enabled boolean,
  fee_type text,
  fee_value numeric,
  min_topup bigint,
  max_topup bigint
)
language sql
security definer
set search_path = public
as $$
  select enabled, fee_type, fee_value, min_topup, max_topup
  from public.topup_fee_settings
  where id = 1;
$$;

revoke all on function public.get_topup_fee_config() from public, anon;
grant execute on function public.get_topup_fee_config() to authenticated;

