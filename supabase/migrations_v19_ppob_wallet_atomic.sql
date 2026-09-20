-- AIDIL STORE v19: atomic wallet payment for prepaid PPOB + idempotent ledger.
-- Run after v14/v18 migrations.

create or replace function public.create_ppob_prepaid_wallet_order(
  p_user_id uuid,
  p_product_id uuid,
  p_customer_no text,
  p_target_data jsonb default '{}'::jsonb,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_service ppob_services%rowtype;
  v_product products%rowtype;
  v_wallet wallets%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_before bigint;
  v_after bigint;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  if coalesce(trim(p_customer_no),'') = '' then raise exception 'TARGET_REQUIRED'; end if;
  if length(p_idempotency_key) < 10 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;

  -- Same key always returns the original order; no second wallet debit.
  select id into v_order_id from orders where idempotency_key=p_idempotency_key;
  if found then
    if exists(select 1 from orders where id=v_order_id and user_id=p_user_id) then return v_order_id; end if;
    raise exception 'IDEMPOTENCY_KEY_CONFLICT';
  end if;

  select * into v_service from ppob_services
    where product_id=p_product_id and provider_active=true and service_kind='prepaid'
    limit 1;
  if not found then raise exception 'PPOB_SERVICE_NOT_FOUND'; end if;

  select * into v_product from products where id=p_product_id and is_active=true for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;

  select * into v_wallet from wallets where user_id=p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.balance < v_product.price then raise exception 'INSUFFICIENT_BALANCE'; end if;

  v_order_number := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,8);
  insert into orders(order_number,user_id,total_amount,status,idempotency_key,payment_method,gateway_reference)
  values(v_order_number,p_user_id,v_product.price,'PROCESSING',p_idempotency_key,'WALLET',v_order_number)
  returning id into v_order_id;

  insert into order_items(order_id,product_id,product_name,unit_price,quantity,subtotal)
  values(v_order_id,v_product.id,v_product.name,v_product.price,1,v_product.price)
  returning id into v_item_id;

  v_before := v_wallet.balance;
  v_after := v_before - v_product.price;
  update wallets set balance=v_after, updated_at=now() where id=v_wallet.id;
  insert into wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
  values(v_wallet.id,'PURCHASE',-v_product.price,v_before,v_after,'order',v_order_id,'Pembayaran PPOB prabayar');

  v_ref := 'AS-' || replace(v_order_id::text,'-','') || '-' || replace(v_item_id::text,'-','');
  insert into ppob_order_targets(order_item_id,customer_no,target_data)
  values(v_item_id,trim(p_customer_no),coalesce(p_target_data,'{}'::jsonb));
  insert into ppob_transactions(order_id,order_item_id,service_id,provider,provider_ref_id,customer_no,target_data,status)
  values(v_order_id,v_item_id,v_service.id,v_service.provider,v_ref,trim(p_customer_no),coalesce(p_target_data,'{}'::jsonb),'WAITING');

  insert into audit_logs(actor_id,action,target_type,target_id,metadata)
  values(p_user_id,'ppob.prepaid_wallet_paid','order',v_order_id,jsonb_build_object('product_id',p_product_id,'amount',v_product.price,'provider',v_service.provider));

  return v_order_id;
exception
  when unique_violation then
    select id into v_order_id from orders where idempotency_key=p_idempotency_key and user_id=p_user_id;
    if v_order_id is not null then return v_order_id; end if;
    raise;
end; $$;

revoke all on function public.create_ppob_prepaid_wallet_order(uuid,uuid,text,jsonb,text) from public, anon;
grant execute on function public.create_ppob_prepaid_wallet_order(uuid,uuid,text,jsonb,text) to authenticated;
