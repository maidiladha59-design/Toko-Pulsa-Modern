-- AIDIL STORE v38 - Financial Dashboard & Reporting
-- Apply after v37. Historical values are based on data available at event time.

create table if not exists public.financial_ledger (
  id uuid primary key default extensions.uuid_generate_v4(),
  event_type text not null check (event_type in ('ORDER_SALE','ORDER_REFUND','TOPUP_FEE')),
  source_type text not null check (source_type in ('order','topup')),
  source_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  gross_amount bigint not null default 0,
  provider_cost bigint not null default 0,
  gateway_cost bigint not null default 0,
  fee_revenue bigint not null default 0,
  net_profit bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(event_type, source_type, source_id)
);

create index if not exists financial_ledger_occurred_idx on public.financial_ledger(occurred_at desc);
create index if not exists financial_ledger_type_idx on public.financial_ledger(event_type, occurred_at desc);
create index if not exists financial_ledger_user_idx on public.financial_ledger(user_id, occurred_at desc);

alter table public.financial_ledger enable row level security;
drop policy if exists "financial_ledger_admin" on public.financial_ledger;
create policy "financial_ledger_admin" on public.financial_ledger
  for all using (is_admin()) with check (is_admin());

create or replace function public.record_financial_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order public.orders%rowtype;
  v_provider_cost bigint := 0;
  v_gateway_cost bigint := 0;
  v_fee_revenue bigint := 0;
  v_profit bigint := 0;
  v_ppob_count integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.status <> 'COMPLETED' then return; end if;

  select
    coalesce(sum(coalesce(ps.cost_price,0) + coalesce(ps.provider_admin,0)) * oi.quantity,0),
    count(*)
  into v_provider_cost, v_ppob_count
  from public.order_items oi
  left join public.ppob_services ps on ps.product_id = oi.product_id
  where oi.order_id = p_order_id and ps.id is not null;

  v_gateway_cost := coalesce(v_order.gateway_fee,0);
  -- fee_revenue is the contribution after known provider cost. For ordinary
  -- non-PPOB products, provider cost is unknown and therefore not deducted.
  v_fee_revenue := greatest(v_order.total_amount - v_provider_cost, 0);
  v_profit := v_order.total_amount - v_provider_cost - v_gateway_cost;

  insert into public.financial_ledger(
    event_type, source_type, source_id, user_id, gross_amount,
    provider_cost, gateway_cost, fee_revenue, net_profit, metadata, occurred_at
  ) values (
    'ORDER_SALE','order',v_order.id,v_order.user_id,v_order.total_amount,
    v_provider_cost,v_gateway_cost,v_fee_revenue,v_profit,
    jsonb_build_object('order_number',v_order.order_number,'payment_method',v_order.payment_method,'gateway_method',v_order.gateway_method,'ppob_items',v_ppob_count),
    coalesce(v_order.updated_at,now())
  ) on conflict (event_type,source_type,source_id) do nothing;
end;
$$;

create or replace function public.record_financial_order_refund(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare r public.financial_ledger%rowtype;
begin
  select * into r from public.financial_ledger
  where event_type='ORDER_SALE' and source_type='order' and source_id=p_order_id;
  if not found then return; end if;
  insert into public.financial_ledger(
    event_type,source_type,source_id,user_id,gross_amount,provider_cost,gateway_cost,fee_revenue,net_profit,metadata,occurred_at
  ) values (
    'ORDER_REFUND','order',p_order_id,r.user_id,-r.gross_amount,-r.provider_cost,-r.gateway_cost,-r.fee_revenue,-r.net_profit,
    jsonb_build_object('reversal_of',r.id),now()
  ) on conflict (event_type,source_type,source_id) do nothing;
end;
$$;

create or replace function public.record_financial_topup(p_topup_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v public.topups%rowtype;
begin
  select * into v from public.topups where id=p_topup_id;
  if not found or v.status <> 'APPROVED' then return; end if;
  insert into public.financial_ledger(
    event_type,source_type,source_id,user_id,gross_amount,provider_cost,gateway_cost,fee_revenue,net_profit,metadata,occurred_at
  ) values (
    'TOPUP_FEE','topup',v.id,v.user_id,coalesce(v.payment_amount,v.amount+coalesce(v.admin_fee,0)),0,coalesce(v.gateway_fee,0),coalesce(v.admin_fee,0),
    coalesce(v.admin_fee,0)-coalesce(v.gateway_fee,0),
    jsonb_build_object('amount',v.amount,'admin_fee',coalesce(v.admin_fee,0),'payment_method',v.payment_method,'fee_group',v.fee_group,'provider',v.provider),
    coalesce(v.paid_at,v.updated_at,now())
  ) on conflict (event_type,source_type,source_id) do nothing;
end;
$$;

create or replace function public.trg_financial_orders()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
  if new.status='COMPLETED' and old.status is distinct from new.status then perform public.record_financial_order(new.id); end if;
  if new.status='REFUNDED' and old.status is distinct from new.status then perform public.record_financial_order_refund(new.id); end if;
  return new;
end; $$;

drop trigger if exists trg_financial_orders on public.orders;
create trigger trg_financial_orders after update of status on public.orders
for each row execute function public.trg_financial_orders();

create or replace function public.trg_financial_topups()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin
  if new.status='APPROVED' and old.status is distinct from new.status then perform public.record_financial_topup(new.id); end if;
  return new;
end; $$;

drop trigger if exists trg_financial_topups on public.topups;
create trigger trg_financial_topups after update of status on public.topups
for each row execute function public.trg_financial_topups();

revoke all on function public.record_financial_order(uuid) from public, anon, authenticated;
revoke all on function public.record_financial_order_refund(uuid) from public, anon, authenticated;
revoke all on function public.record_financial_topup(uuid) from public, anon, authenticated;
grant execute on function public.record_financial_order(uuid) to service_role;
grant execute on function public.record_financial_order_refund(uuid) to service_role;
grant execute on function public.record_financial_topup(uuid) to service_role;

-- Backfill safe, idempotent records for already completed/approved transactions.
do $$
declare r record;
begin
  for r in select id from public.orders where status='COMPLETED' loop perform public.record_financial_order(r.id); end loop;
  for r in select id from public.topups where status='APPROVED' loop perform public.record_financial_topup(r.id); end loop;
end $$;
