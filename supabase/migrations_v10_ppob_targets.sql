-- PPOB target data is stored separately from product catalog and payment metadata.
create table if not exists ppob_order_targets (
  id uuid primary key default uuid_generate_v4(),
  order_item_id uuid not null unique references order_items(id) on delete cascade,
  customer_no text not null,
  target_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ppob_order_targets enable row level security;
create policy "ppob_targets_own_or_admin" on ppob_order_targets
  for select using (exists (
    select 1 from order_items oi join orders o on o.id = oi.order_id
    where oi.id = order_item_id and (o.user_id = auth.uid() or is_admin())
  ));
create policy "ppob_targets_admin_write" on ppob_order_targets
  for all using (is_admin()) with check (is_admin());

create index if not exists ppob_order_targets_item_idx on ppob_order_targets(order_item_id);
