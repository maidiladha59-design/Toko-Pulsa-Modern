-- AIDIL STORE v13: secure postpaid inquiry quotes + dynamic bill payment
create table if not exists public.ppob_inquiries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.ppob_services(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  customer_no text not null,
  provider_price bigint not null default 0,
  provider_admin bigint not null default 0,
  provider_selling_price bigint not null check (provider_selling_price > 0),
  quote_amount bigint not null check (quote_amount > 0),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','USED','EXPIRED')),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists ppob_inquiries_user_idx on public.ppob_inquiries(user_id, created_at desc);
create index if not exists ppob_inquiries_expiry_idx on public.ppob_inquiries(status, expires_at);

alter table public.ppob_inquiries enable row level security;
drop policy if exists "ppob_inquiries_own" on public.ppob_inquiries;
create policy "ppob_inquiries_own" on public.ppob_inquiries for select using (user_id = auth.uid() or is_admin());
drop policy if exists "ppob_inquiries_admin" on public.ppob_inquiries;
create policy "ppob_inquiries_admin" on public.ppob_inquiries for all using (is_admin()) with check (is_admin());

-- Wallet: creates a dynamic-price postpaid order atomically and prepares provider transaction.
create or replace function public.create_ppob_postpaid_wallet_order(
  p_user_id uuid, p_inquiry_id uuid, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_i ppob_inquiries%rowtype;
  v_wallet wallets%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_balance_before bigint;
  v_balance_after bigint;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  select * into v_i from ppob_inquiries where id = p_inquiry_id for update;
  if not found or v_i.user_id <> p_user_id then raise exception 'INQUIRY_NOT_FOUND'; end if;
  if v_i.status <> 'ACTIVE' or v_i.expires_at <= now() then
    update ppob_inquiries set status='EXPIRED' where id=v_i.id and status='ACTIVE';
    raise exception 'INQUIRY_EXPIRED';
  end if;
  if v_i.order_id is not null then
    return v_i.order_id;
  end if;
  select id into v_order_id from orders where idempotency_key = p_idempotency_key;
  if found then return v_order_id; end if;

  select * into v_wallet from wallets where user_id=p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.balance < v_i.quote_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;

  v_order_number := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,8);
  insert into orders(order_number,user_id,total_amount,status,idempotency_key,payment_method,gateway_reference)
  values(v_order_number,p_user_id,v_i.quote_amount,'PROCESSING',p_idempotency_key,'WALLET',v_order_number)
  returning id into v_order_id;

  insert into order_items(order_id,product_id,product_name,unit_price,quantity,subtotal)
  select v_order_id,p.id,p.name,v_i.quote_amount,1,v_i.quote_amount from products p where p.id=v_i.product_id and p.is_active=true;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  select id into v_item_id from order_items where order_id=v_order_id limit 1;

  v_balance_before := v_wallet.balance;
  v_balance_after := v_wallet.balance - v_i.quote_amount;
  update wallets set balance=v_balance_after,updated_at=now() where id=v_wallet.id;
  insert into wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
  values(v_wallet.id,'PURCHASE',-v_i.quote_amount,v_balance_before,v_balance_after,'order',v_order_id,'Pembayaran PPOB pascabayar');

  v_ref := 'AS-' || replace(v_order_id::text,'-','') || '-' || replace(v_item_id::text,'-','');
  insert into ppob_order_targets(order_item_id,customer_no,target_data)
  values(v_item_id,v_i.customer_no,v_i.payload)
  on conflict(order_item_id) do update set customer_no=excluded.customer_no,target_data=excluded.target_data,updated_at=now();
  insert into ppob_transactions(order_id,order_item_id,service_id,provider,provider_ref_id,customer_no,target_data,status)
  select v_order_id,v_item_id,ps.id,ps.provider,v_ref,v_i.customer_no,v_i.payload,'WAITING'
  from ppob_services ps where ps.id=v_i.service_id and ps.provider_active=true;
  if not found then raise exception 'PPOB_SERVICE_NOT_FOUND'; end if;

  update ppob_inquiries set status='USED',order_id=v_order_id,used_at=now() where id=v_i.id;
  insert into audit_logs(actor_id,action,target_type,target_id,metadata)
  values(p_user_id,'ppob.postpaid_wallet_paid','order',v_order_id,jsonb_build_object('inquiry_id',v_i.id,'amount',v_i.quote_amount));
  return v_order_id;
end; $$;
revoke all on function public.create_ppob_postpaid_wallet_order(uuid,uuid,text) from public;
grant execute on function public.create_ppob_postpaid_wallet_order(uuid,uuid,text) to authenticated;

-- Gateway: creates a dynamic-price pending order atomically. Payment is created by the server afterwards.
create or replace function public.create_ppob_postpaid_gateway_order(
  p_user_id uuid, p_inquiry_id uuid, p_idempotency_key text, p_payment_method text, p_gateway_method text
) returns table(order_id uuid,order_number text,total_amount bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_i ppob_inquiries%rowtype;
  v_order_id uuid;
  v_order_number text;
  v_item_id uuid;
  v_ref text;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_user_id <> auth.uid() then raise exception 'USER_ID_MISMATCH'; end if;
  if p_payment_method not in ('QRIS','BANK_VA') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  select * into v_i from ppob_inquiries where id=p_inquiry_id for update;
  if not found or v_i.user_id<>p_user_id then raise exception 'INQUIRY_NOT_FOUND'; end if;
  if v_i.status<>'ACTIVE' or v_i.expires_at<=now() then
    update ppob_inquiries set status='EXPIRED' where id=v_i.id and status='ACTIVE';
    raise exception 'INQUIRY_EXPIRED';
  end if;
  if v_i.order_id is not null then
    return query select o.id,o.order_number,o.total_amount from orders o where o.id=v_i.order_id;
    return;
  end if;
  select o.id,o.order_number,o.total_amount into v_order_id,v_order_number,v_i.quote_amount from orders o where o.idempotency_key=p_idempotency_key;
  if found then return query select v_order_id,v_order_number,v_i.quote_amount; return; end if;
  if not exists(select 1 from products where id=v_i.product_id and is_active=true) then raise exception 'PRODUCT_NOT_FOUND'; end if;
  v_order_number := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(extensions.uuid_generate_v4()::text,'-',''),1,8);
  insert into orders(order_number,user_id,total_amount,status,idempotency_key,payment_method,gateway_reference,gateway_method)
  values(v_order_number,p_user_id,v_i.quote_amount,'PENDING',p_idempotency_key,p_payment_method,v_order_number,p_gateway_method)
  returning id into v_order_id;
  insert into order_items(order_id,product_id,product_name,unit_price,quantity,subtotal)
  select v_order_id,p.id,p.name,v_i.quote_amount,1,v_i.quote_amount from products p where p.id=v_i.product_id;
  select id into v_item_id from order_items where order_id=v_order_id limit 1;
  v_ref := 'AS-' || replace(v_order_id::text,'-','') || '-' || replace(v_item_id::text,'-','');
  insert into ppob_order_targets(order_item_id,customer_no,target_data) values(v_item_id,v_i.customer_no,v_i.payload);
  insert into ppob_transactions(order_id,order_item_id,service_id,provider,provider_ref_id,customer_no,target_data,status)
  select v_order_id,v_item_id,ps.id,ps.provider,v_ref,v_i.customer_no,v_i.payload,'WAITING' from ppob_services ps where ps.id=v_i.service_id and ps.provider_active=true;
  if not found then raise exception 'PPOB_SERVICE_NOT_FOUND'; end if;
  update ppob_inquiries set status='USED',order_id=v_order_id,used_at=now() where id=v_i.id;
  return query select v_order_id,v_order_number,v_i.quote_amount;
end; $$;
revoke all on function public.create_ppob_postpaid_gateway_order(uuid,uuid,text,text,text) from public;
grant execute on function public.create_ppob_postpaid_gateway_order(uuid,uuid,text,text,text) to authenticated;
