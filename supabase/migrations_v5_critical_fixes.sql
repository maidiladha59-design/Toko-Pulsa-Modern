-- AIDIL STORE v5 — critical fixes for an existing database
-- Jalankan SEKALI setelah migration/schema sebelumnya.

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_status order_status,
  p_admin_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_order orders%rowtype;
  v_wallet wallets%rowtype;
  v_before bigint;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_admin_id <> auth.uid() then raise exception 'ADMIN_ID_MISMATCH'; end if;
  if not exists (select 1 from profiles where id = auth.uid() and role in ('ADMIN','SUPER_ADMIN')) then raise exception 'ADMIN_ONLY'; end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_status = 'REFUNDED' and v_order.status <> 'REFUNDED' then
    select * into v_wallet from wallets where user_id = v_order.user_id for update;
    if not found then raise exception 'WALLET_NOT_FOUND'; end if;
    v_before := v_wallet.balance;
    update wallets set balance = balance + v_order.total_amount, updated_at = now() where id = v_wallet.id;
    insert into wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
    values(v_wallet.id,'REFUND',v_order.total_amount,v_before,v_before+v_order.total_amount,'order',v_order.id,coalesce(p_note,'Refund order'));
  elsif p_status = 'REFUNDED' and v_order.status = 'REFUNDED' then
    raise exception 'ORDER_ALREADY_REFUNDED';
  end if;

  update orders set status = p_status, updated_at = now() where id = v_order.id;
  insert into audit_logs(actor_id,action,target_type,target_id,metadata)
  values(p_admin_id,'order.status_update','order',v_order.id,jsonb_build_object('from',v_order.status,'to',p_status,'note',p_note));
end;
$$;

revoke all on function public.admin_update_order_status(uuid, order_status, uuid, text) from public;
grant execute on function public.admin_update_order_status(uuid, order_status, uuid, text) to authenticated;

-- Replace checkout() on an existing database so digital purchases become COMPLETED automatically.
create function public.checkout(
  p_user_id uuid,
  p_items jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_wallet wallets%rowtype;
  v_order_id uuid;
  v_item jsonb;
  v_product products%rowtype;
  v_total bigint := 0;
  v_subtotal bigint;
  v_order_number text;
begin
  -- SECURITY DEFINER tetap wajib memastikan checkout hanya untuk user yang login.
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_user_id <> auth.uid() then
    raise exception 'USER_ID_MISMATCH';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'INVALID_ITEMS';
  end if;

  -- Idempotency: jika sudah ada order dengan key ini, kembalikan order itu
  select id into v_order_id from orders where idempotency_key = p_idempotency_key;
  if found then
    return v_order_id;
  end if;

  select * into v_wallet from wallets where user_id = p_user_id for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  v_order_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6);

  insert into orders (order_number, user_id, total_amount, status, idempotency_key)
  values (v_order_number, p_user_id, 0, 'PENDING', p_idempotency_key)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products
      where id = (v_item->>'product_id')::uuid and is_active = true
      for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND_OR_INACTIVE';
    end if;

    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then
      raise exception 'INVALID_ITEM';
    end if;

    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_QUANTITY';
    end if;

    v_subtotal := v_product.price * (v_item->>'quantity')::int;
    v_total := v_total + v_subtotal;

    insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::int, v_subtotal);
  end loop;

  if v_wallet.balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update wallets set balance = balance - v_total, updated_at = now() where id = v_wallet.id;

  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_wallet.id, 'PURCHASE', -v_total, v_wallet.balance, v_wallet.balance - v_total, 'order', v_order_id, 'Pembelian produk');

  -- Produk digital langsung selesai setelah saldo berhasil dipotong;
  -- produk/jasa non-digital tetap PROCESSING untuk dikerjakan admin.
  if not exists (
    select 1 from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = v_order_id and coalesce(p.product_type, 'digital') <> 'digital'
  ) then
    update orders set total_amount = v_total, status = 'COMPLETED', updated_at = now() where id = v_order_id;
  else
    update orders set total_amount = v_total, status = 'PROCESSING', updated_at = now() where id = v_order_id;
  end if;

  insert into audit_logs (actor_id, action, target_type, target_id)
  values (p_user_id, 'order.purchase', 'order', v_order_id);

  return v_order_id;
end;
$$;

revoke all on function public.checkout(uuid, jsonb, text) from public;
grant execute on function public.checkout(uuid, jsonb, text) to authenticated;
