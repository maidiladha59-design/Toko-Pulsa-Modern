-- =========================================================
-- AIDIL STORE v8 — Automatic Bank/QRIS payments + richer profile
-- Run once after v7.
-- =========================================================

-- Payment gateway metadata
alter table public.orders add column if not exists gateway_method text;
alter table public.orders add column if not exists payment_number text;
alter table public.orders add column if not exists gateway_fee bigint;
alter table public.orders add column if not exists gateway_total_payment bigint;

-- Richer customer profile
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists postal_code text;

-- Helpful indexes for webhook/status checks
create index if not exists orders_gateway_reference_idx on public.orders(gateway_reference);
create index if not exists orders_payment_status_idx on public.orders(payment_method, status);

-- Generic gateway order creator. The client never supplies price:
-- product prices are read from the database.
create or replace function public.create_gateway_order(
  p_user_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_payment_method text,
  p_gateway_method text
)
returns table (order_id uuid, order_number text, total_amount bigint)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product products%rowtype;
  v_total bigint := 0;
  v_subtotal bigint;
  v_existing orders%rowtype;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  if p_payment_method not in ('QRIS', 'BANK_VA') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if p_gateway_method not in (
    'qris','bri_va','bni_va','cimb_niaga_va','sampoerna_va',
    'bnc_va','maybank_va','permata_va','atm_bersama_va','artha_graha_va'
  ) then raise exception 'INVALID_GATEWAY_METHOD'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'INVALID_ITEMS';
  end if;

  select * into v_existing from orders where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payment_method in ('QRIS','BANK_VA') then
      return query select v_existing.id, v_existing.order_number, v_existing.total_amount;
      return;
    end if;
    raise exception 'ORDER_ALREADY_PAID';
  end if;

  v_order_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' ||
    substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 8);

  insert into orders (
    order_number, user_id, total_amount, status, idempotency_key,
    payment_method, gateway_reference, gateway_method
  )
  values (
    v_order_number, p_user_id, 0, 'PENDING', p_idempotency_key,
    p_payment_method, v_order_number, p_gateway_method
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then
      raise exception 'INVALID_ITEM';
    end if;

    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_QUANTITY';
    end if;

    select * into v_product
      from products
      where id = (v_item->>'product_id')::uuid and is_active = true
      for update;

    if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

    v_subtotal := v_product.price * (v_item->>'quantity')::int;
    v_total := v_total + v_subtotal;

    insert into order_items (
      order_id, product_id, product_name, unit_price, quantity, subtotal
    )
    values (
      v_order_id, v_product.id, v_product.name, v_product.price,
      (v_item->>'quantity')::int, v_subtotal
    );
  end loop;

  update orders set total_amount = v_total, updated_at = now()
  where id = v_order_id;

  return query select v_order_id, v_order_number, v_total;
end;
$$;

revoke all on function public.create_gateway_order(uuid, jsonb, text, text, text) from public;
grant execute on function public.create_gateway_order(uuid, jsonb, text, text, text) to authenticated;

-- One idempotent confirmation function for both QRIS and Virtual Account.
-- It is ONLY executable by server-side service_role.
create or replace function public.confirm_gateway_payment(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_all_digital boolean;
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if v_order.status <> 'PENDING' then return; end if;

  select not exists (
    select 1
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = p_order_id
      and coalesce(p.product_type, 'digital') <> 'digital'
  ) into v_all_digital;

  update orders
  set
    status = case when v_all_digital then 'COMPLETED' else 'PROCESSING' end,
    paid_at = coalesce(paid_at, now()),
    updated_at = now()
  where id = p_order_id and status = 'PENDING';

  insert into audit_logs(action, target_type, target_id, metadata)
  values (
    'order.gateway_paid',
    'order',
    p_order_id,
    jsonb_build_object(
      'payment_method', v_order.payment_method,
      'gateway_method', v_order.gateway_method
    )
  );
end;
$$;

revoke all on function public.confirm_gateway_payment(uuid) from public, authenticated, anon;
grant execute on function public.confirm_gateway_payment(uuid) to service_role;

-- Keep old QRIS function working for any existing page/code.
create or replace function public.confirm_qris_payment(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
begin
  perform public.confirm_gateway_payment(p_order_id);
end;
$$;

revoke all on function public.confirm_qris_payment(uuid) from public, authenticated, anon;
grant execute on function public.confirm_qris_payment(uuid) to service_role;
