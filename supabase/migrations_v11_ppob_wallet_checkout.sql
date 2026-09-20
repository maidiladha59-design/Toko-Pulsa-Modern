-- AIDIL STORE v11: wallet checkout must not mark PPOB orders completed before fulfillment.
create or replace function public.checkout(
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
  v_has_ppob boolean := false;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'INVALID_ITEMS'; end if;
  select id into v_order_id from orders where idempotency_key = p_idempotency_key;
  if found then return v_order_id; end if;
  select * into v_wallet from wallets where user_id = p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  v_order_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 6);
  insert into orders (order_number, user_id, total_amount, status, idempotency_key)
  values (v_order_number, p_user_id, 0, 'PENDING', p_idempotency_key) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then raise exception 'INVALID_ITEM'; end if;
    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from products where id = (v_item->>'product_id')::uuid and is_active = true for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND_OR_INACTIVE'; end if;
    if exists (select 1 from ppob_services ps where ps.product_id = v_product.id and ps.provider_active = true) then v_has_ppob := true; end if;
    v_subtotal := v_product.price * (v_item->>'quantity')::int;
    v_total := v_total + v_subtotal;
    insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, (v_item->>'quantity')::int, v_subtotal);
  end loop;

  if v_wallet.balance < v_total then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update wallets set balance = balance - v_total, updated_at = now() where id = v_wallet.id;
  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_wallet.id, 'PURCHASE', -v_total, v_wallet.balance, v_wallet.balance - v_total, 'order', v_order_id, 'Pembelian produk');

  update orders set total_amount = v_total,
    status = case when v_has_ppob then 'PROCESSING' when not exists (
      select 1 from order_items oi join products p on p.id = oi.product_id
      where oi.order_id = v_order_id and coalesce(p.product_type, 'digital') <> 'digital'
    ) then 'COMPLETED' else 'PROCESSING' end,
    updated_at = now() where id = v_order_id;

  insert into audit_logs (actor_id, action, target_type, target_id) values (p_user_id, 'order.purchase', 'order', v_order_id);
  return v_order_id;
end;
$$;
revoke all on function public.checkout(uuid, jsonb, text) from public;
grant execute on function public.checkout(uuid, jsonb, text) to authenticated;
