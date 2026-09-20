-- AIDIL STORE v45 — Production hardening and final security fixes
-- 1) Voucher redemption can no longer trust a client-supplied discount/order/user.
-- 2) Loyalty points can only be awarded by trusted server-side code.
-- 3) Pending gateway orders can apply a voucher before payment is created.
-- 4) Wallet checkout gets an atomic voucher-aware variant.

alter table public.orders add column if not exists voucher_id uuid references public.promo_vouchers(id) on delete set null;
alter table public.orders add column if not exists discount_amount bigint not null default 0 check (discount_amount >= 0);
create index if not exists orders_voucher_idx on public.orders(voucher_id);

create or replace function public.redeem_voucher(p_voucher_id uuid,p_user_id uuid,p_order_id uuid,p_discount bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v public.promo_vouchers;
  o public.orders%rowtype;
  used integer;
  discount bigint;
  inserted_count integer;
begin
  if auth.uid() is null or p_user_id <> auth.uid() then raise exception 'UNAUTHORIZED'; end if;
  select * into o from public.orders where id=p_order_id and user_id=auth.uid() for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status <> 'PENDING' then raise exception 'ORDER_NOT_PENDING'; end if;
  if o.voucher_id is not null then return true; end if;
  select * into v from public.promo_vouchers where id=p_voucher_id for update;
  if not found or not v.is_active or v.starts_at>now() or (v.expires_at is not null and v.expires_at<=now()) then raise exception 'VOUCHER_INVALID'; end if;
  if v.usage_limit is not null and v.used_count>=v.usage_limit then raise exception 'VOUCHER_LIMIT'; end if;
  select count(*) into used from public.promo_redemptions where voucher_id=v.id and user_id=auth.uid();
  if used>=v.usage_per_user then raise exception 'VOUCHER_USER_LIMIT'; end if;
  if o.total_amount<v.min_order_amount then raise exception 'VOUCHER_MIN_ORDER'; end if;
  discount:=case when v.discount_type='PERCENTAGE' then floor(o.total_amount*v.discount_value/100.0) else v.discount_value end;
  if v.max_discount is not null then discount:=least(discount,v.max_discount); end if;
  discount:=least(greatest(discount,0),o.total_amount);
  insert into public.promo_redemptions(voucher_id,user_id,order_id,discount_amount)
    values(v.id,auth.uid(),o.id,discount) on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count=0 then return true; end if;
  update public.promo_vouchers set used_count=used_count+1,updated_at=now() where id=v.id;
  update public.orders set voucher_id=v.id,discount_amount=discount,total_amount=o.total_amount-discount,updated_at=now() where id=o.id;
  return true;
end $$;
revoke all on function public.redeem_voucher(uuid,uuid,uuid,bigint) from public;
grant execute on function public.redeem_voucher(uuid,uuid,uuid,bigint) to authenticated;

create or replace function public.award_loyalty_points(p_user_id uuid,p_points bigint,p_reason text,p_reference_type text,p_reference_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare lvl uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ONLY'; end if;
  if p_points<=0 then return true; end if;
  insert into public.loyalty_accounts(user_id) values(p_user_id) on conflict do nothing;
  insert into public.loyalty_ledger(user_id,points,reason,reference_type,reference_id)
    values(p_user_id,p_points,p_reason,p_reference_type,p_reference_id)
    on conflict(user_id,reference_type,reference_id) do nothing;
  if not found then return true; end if;
  update public.loyalty_accounts set points=points+p_points,lifetime_points=lifetime_points+p_points,updated_at=now() where user_id=p_user_id;
  select id into lvl from public.loyalty_levels where is_active and min_points <= (select lifetime_points from public.loyalty_accounts where user_id=p_user_id) order by min_points desc limit 1;
  update public.loyalty_accounts set level_id=lvl where user_id=p_user_id;
  return true;
end $$;
revoke all on function public.award_loyalty_points(uuid,bigint,text,text,uuid) from public, authenticated, anon;
grant execute on function public.award_loyalty_points(uuid,bigint,text,text,uuid) to service_role;

create or replace function public.apply_voucher_to_pending_order(p_order_id uuid,p_code text)
returns table(order_id uuid,total_amount bigint,discount_amount bigint,voucher_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  o public.orders%rowtype; v public.promo_vouchers%rowtype; used integer; d bigint;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into o from public.orders where id=p_order_id and user_id=auth.uid() for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status <> 'PENDING' then raise exception 'ORDER_NOT_PENDING'; end if;
  if o.voucher_id is not null then
    return query select o.id,o.total_amount,o.discount_amount,o.voucher_id; return;
  end if;
  if trim(coalesce(p_code,''))='' then raise exception 'VOUCHER_INVALID'; end if;
  select * into v from public.promo_vouchers where upper(code)=upper(trim(p_code)) and is_active and starts_at<=now() and (expires_at is null or expires_at>now()) for update;
  if not found then raise exception 'VOUCHER_INVALID'; end if;
  if v.usage_limit is not null and v.used_count>=v.usage_limit then raise exception 'VOUCHER_LIMIT'; end if;
  select count(*) into used from public.promo_redemptions where voucher_id=v.id and user_id=auth.uid();
  if used>=v.usage_per_user then raise exception 'VOUCHER_USER_LIMIT'; end if;
  if o.total_amount<v.min_order_amount then raise exception 'VOUCHER_MIN_ORDER'; end if;
  d:=case when v.discount_type='PERCENTAGE' then floor(o.total_amount*v.discount_value/100.0) else v.discount_value end;
  if v.max_discount is not null then d:=least(d,v.max_discount); end if;
  d:=least(greatest(d,0),o.total_amount);
  insert into public.promo_redemptions(voucher_id,user_id,order_id,discount_amount) values(v.id,auth.uid(),o.id,d);
  update public.promo_vouchers set used_count=used_count+1,updated_at=now() where id=v.id;
  update public.orders set voucher_id=v.id,discount_amount=d,total_amount=o.total_amount-d,updated_at=now() where id=o.id;
  return query select o.id,o.total_amount-d,d,v.id;
end $$;
revoke all on function public.apply_voucher_to_pending_order(uuid,text) from public;
grant execute on function public.apply_voucher_to_pending_order(uuid,text) to authenticated;

-- Atomic wallet checkout with an optional voucher. Product prices and discount are server-side.
create or replace function public.checkout_with_voucher(p_user_id uuid,p_items jsonb,p_idempotency_key text,p_voucher_code text default null)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare
  v_wallet wallets%rowtype; v_order_id uuid; v_item jsonb; v_product products%rowtype;
  v_total bigint:=0; v_subtotal bigint; v_order_number text; v_has_ppob boolean:=false;
  v_voucher promo_vouchers%rowtype; v_used integer; v_discount bigint:=0;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id<>auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 then raise exception 'INVALID_ITEMS'; end if;
  select id into v_order_id from orders where idempotency_key=p_idempotency_key;
  if found then return v_order_id; end if;
  select * into v_wallet from wallets where user_id=p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  v_order_number:='INV-'||to_char(now(),'YYYYMMDD')||'-'||substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,6);
  insert into orders(order_number,user_id,total_amount,status,idempotency_key) values(v_order_number,p_user_id,0,'PENDING',p_idempotency_key) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') then raise exception 'INVALID_ITEM'; end if;
    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then raise exception 'INVALID_QUANTITY'; end if;
    select * into v_product from products where id=(v_item->>'product_id')::uuid and is_active=true for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND_OR_INACTIVE'; end if;
    if exists(select 1 from ppob_services ps where ps.product_id=v_product.id and ps.provider_active=true) then v_has_ppob:=true; end if;
    v_subtotal:=v_product.price*(v_item->>'quantity')::int; v_total:=v_total+v_subtotal;
    insert into order_items(order_id,product_id,product_name,unit_price,quantity,subtotal) values(v_order_id,v_product.id,v_product.name,v_product.price,(v_item->>'quantity')::int,v_subtotal);
  end loop;
  if trim(coalesce(p_voucher_code,''))<>'' then
    select * into v_voucher from promo_vouchers where upper(code)=upper(trim(p_voucher_code)) and is_active and starts_at<=now() and (expires_at is null or expires_at>now()) for update;
    if not found then raise exception 'VOUCHER_INVALID'; end if;
    if v_voucher.usage_limit is not null and v_voucher.used_count>=v_voucher.usage_limit then raise exception 'VOUCHER_LIMIT'; end if;
    select count(*) into v_used from promo_redemptions where voucher_id=v_voucher.id and user_id=p_user_id;
    if v_used>=v_voucher.usage_per_user then raise exception 'VOUCHER_USER_LIMIT'; end if;
    if v_total<v_voucher.min_order_amount then raise exception 'VOUCHER_MIN_ORDER'; end if;
    v_discount:=case when v_voucher.discount_type='PERCENTAGE' then floor(v_total*v_voucher.discount_value/100.0) else v_voucher.discount_value end;
    if v_voucher.max_discount is not null then v_discount:=least(v_discount,v_voucher.max_discount); end if;
    v_discount:=least(greatest(v_discount,0),v_total);
    insert into promo_redemptions(voucher_id,user_id,order_id,discount_amount) values(v_voucher.id,p_user_id,v_order_id,v_discount);
    update promo_vouchers set used_count=used_count+1,updated_at=now() where id=v_voucher.id;
  end if;
  v_total:=v_total-v_discount;
  if v_wallet.balance<v_total then raise exception 'INSUFFICIENT_BALANCE'; end if;
  update wallets set balance=balance-v_total,updated_at=now() where id=v_wallet.id;
  insert into wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
    values(v_wallet.id,'PURCHASE',-v_total,v_wallet.balance,v_wallet.balance-v_total,'order',v_order_id,'Pembelian produk');
  update orders set total_amount=v_total,discount_amount=v_discount,voucher_id=v_voucher.id,
    status=case when v_has_ppob then 'PROCESSING' when not exists(select 1 from order_items oi join products p on p.id=oi.product_id where oi.order_id=v_order_id and coalesce(p.product_type,'digital')<>'digital') then 'COMPLETED' else 'PROCESSING' end,
    updated_at=now() where id=v_order_id;
  insert into audit_logs(actor_id,action,target_type,target_id) values(p_user_id,'order.purchase','order',v_order_id);
  return v_order_id;
end $$;
revoke all on function public.checkout_with_voucher(uuid,jsonb,text,text) from public;
grant execute on function public.checkout_with_voucher(uuid,jsonb,text,text) to authenticated;
