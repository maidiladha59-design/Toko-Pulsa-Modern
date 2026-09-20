-- AIDIL STORE v9 PPOB ENGINE
-- Run after v8.
-- Provider credentials stay server-side in environment variables.

create table if not exists ppob_services (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null unique references products(id) on delete cascade,
  provider text not null default 'digiflazz',
  provider_sku text not null,
  service_kind text not null check (service_kind in ('prepaid','postpaid')),
  category text not null,
  brand text,
  cost_price bigint not null default 0 check (cost_price >= 0),
  margin bigint not null default 0 check (margin >= 0),
  target_schema jsonb not null default '{"fields":[{"name":"customer_no","label":"Nomor Tujuan","type":"text","required":true}]}'::jsonb,
  provider_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create unique index if not exists ppob_services_provider_sku_idx on ppob_services(provider, provider_sku);
create index if not exists ppob_services_category_idx on ppob_services(category, brand);

create table if not exists ppob_transactions (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references orders(id) on delete cascade,
  order_item_id uuid not null unique references order_items(id) on delete cascade,
  service_id uuid not null references ppob_services(id),
  provider text not null,
  provider_ref_id text not null unique,
  customer_no text not null,
  target_data jsonb not null default '{}'::jsonb,
  status text not null default 'WAITING' check (status in ('WAITING','PROCESSING','SUCCESS','FAILED','REFUNDED')),
  provider_status text,
  response_code text,
  serial_number text,
  provider_message text,
  provider_payload jsonb,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ppob_transactions_order_idx on ppob_transactions(order_id);
create index if not exists ppob_transactions_status_idx on ppob_transactions(status, updated_at);

alter table ppob_services enable row level security;
alter table ppob_transactions enable row level security;

create policy "ppob_services_public_active" on ppob_services
  for select using (provider_active = true or is_admin());
create policy "ppob_services_admin_write" on ppob_services
  for all using (is_admin()) with check (is_admin());

create policy "ppob_transactions_own_or_admin" on ppob_transactions
  for select using (
    exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_admin()))
  );
create policy "ppob_transactions_admin_write" on ppob_transactions
  for all using (is_admin()) with check (is_admin());

-- Replace v8 confirmation logic so a paid PPOB order becomes PROCESSING,
-- not COMPLETED before the supplier has actually delivered the service.
create or replace function public.confirm_gateway_payment(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_all_digital boolean;
  v_has_ppob boolean;
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'PENDING' then return; end if;

  select not exists (
    select 1 from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and coalesce(p.product_type, 'digital') <> 'digital'
  ) into v_all_digital;

  select exists (
    select 1 from order_items oi
    join ppob_services ps on ps.product_id = oi.product_id
    where oi.order_id = p_order_id and ps.provider_active = true
  ) into v_has_ppob;

  update orders
  set status = case
      when v_has_ppob then 'PROCESSING'
      when v_all_digital then 'COMPLETED'
      else 'PROCESSING'
    end,
    paid_at = coalesce(paid_at, now()),
    updated_at = now()
  where id = p_order_id and status = 'PENDING';

  insert into audit_logs(action, target_type, target_id, metadata)
  values ('order.gateway_paid', 'order', p_order_id,
    jsonb_build_object('payment_method', v_order.payment_method,
                       'gateway_method', v_order.gateway_method,
                       'has_ppob', v_has_ppob));
end;
$$;

revoke all on function public.confirm_gateway_payment(uuid) from public, authenticated, anon;
grant execute on function public.confirm_gateway_payment(uuid) to service_role;

create or replace function public.create_ppob_transactions(p_order_id uuid)
returns integer
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_count integer := 0;
  r record;
  v_target jsonb;
  v_customer_no text;
  v_ref text;
begin
  for r in
    select oi.id order_item_id, oi.quantity, ps.id service_id, ps.provider, ps.provider_sku, ps.target_schema
    from order_items oi
    join ppob_services ps on ps.product_id = oi.product_id and ps.provider_active = true
    where oi.order_id = p_order_id
  loop
    -- Target data is attached by the checkout API before this function is called.
    select coalesce((select target_data from ppob_transactions where order_item_id = r.order_item_id limit 1), '{}'::jsonb) into v_target;
    v_customer_no := nullif(v_target->>'customer_no','');
    if v_customer_no is null then
      continue;
    end if;
    v_ref := 'AS-' || replace(p_order_id::text,'-','') || '-' || replace(r.order_item_id::text,'-','');
    insert into ppob_transactions(order_id, order_item_id, service_id, provider, provider_ref_id, customer_no, target_data)
    values(p_order_id, r.order_item_id, r.service_id, r.provider, v_ref, v_customer_no, v_target)
    on conflict (order_item_id) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.create_ppob_transactions(uuid) from public, authenticated, anon;
grant execute on function public.create_ppob_transactions(uuid) to service_role;
