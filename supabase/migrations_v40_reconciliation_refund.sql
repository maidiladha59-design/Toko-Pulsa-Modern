-- AIDIL STORE v40 - Payment Reconciliation & Refund Center
-- Apply after v39. Designed to be additive and idempotent.

create table if not exists public.refunds (
  id uuid primary key default extensions.uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  amount bigint not null check (amount > 0),
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','FAILED')),
  source text not null default 'SYSTEM' check (source in ('SYSTEM','ADMIN','CUSTOMER')),
  wallet_transaction_id uuid references public.wallet_transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id)
);
create index if not exists refunds_user_idx on public.refunds(user_id, created_at desc);
create index if not exists refunds_status_idx on public.refunds(status, created_at desc);
alter table public.refunds enable row level security;
drop policy if exists "refunds_own_or_admin" on public.refunds;
create policy "refunds_own_or_admin" on public.refunds for select using (user_id = auth.uid() or is_admin());

create table if not exists public.payment_reconciliation (
  id uuid primary key default extensions.uuid_generate_v4(),
  source_type text not null check (source_type in ('TOPUP','ORDER','PPOB')),
  source_id uuid not null,
  provider text,
  internal_status text,
  provider_status text,
  internal_amount bigint,
  provider_amount bigint,
  wallet_amount bigint,
  state text not null check (state in ('MATCHED','MISMATCH','MISSING_PROVIDER','MISSING_WALLET','REVIEW')),
  discrepancy text,
  checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(source_type, source_id)
);
create index if not exists reconciliation_state_idx on public.payment_reconciliation(state, checked_at desc);
create index if not exists reconciliation_source_idx on public.payment_reconciliation(source_type, source_id);
alter table public.payment_reconciliation enable row level security;
drop policy if exists "reconciliation_admin" on public.payment_reconciliation;
create policy "reconciliation_admin" on public.payment_reconciliation for all using (is_admin()) with check (is_admin());

-- Safe, idempotent system refund request. Actual wallet credit is guarded by the
-- existing unique refund ledger index and the order row lock.
create or replace function public.create_system_refund(p_order_id uuid, p_reason text default 'PPOB transaction failed')
returns uuid
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_order public.orders%rowtype;
  v_refund public.refunds%rowtype;
  v_wallet public.wallets%rowtype;
  v_before bigint;
  v_after bigint;
  v_wt_id uuid;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.total_amount <= 0 then raise exception 'INVALID_REFUND_AMOUNT'; end if;

  select * into v_refund from public.refunds where order_id=p_order_id;
  if found then return v_refund.id; end if;

  insert into public.refunds(order_id,user_id,amount,reason,status,source)
  values(p_order_id,v_order.user_id,v_order.total_amount,coalesce(nullif(trim(p_reason),''),'PPOB transaction failed'),'PROCESSING','SYSTEM')
  returning * into v_refund;

  select * into v_wallet from public.wallets where user_id=v_order.user_id for update;
  if not found then
    update public.refunds set status='FAILED',updated_at=now(),metadata=jsonb_build_object('error','WALLET_NOT_FOUND') where id=v_refund.id;
    raise exception 'WALLET_NOT_FOUND';
  end if;

  v_before := v_wallet.balance;
  v_after := v_before + v_refund.amount;
  update public.wallets set balance=v_after,updated_at=now() where id=v_wallet.id;
  insert into public.wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
  values(v_wallet.id,'REFUND',v_refund.amount,v_before,v_after,'order',p_order_id,v_refund.reason)
  returning id into v_wt_id;

  update public.refunds set status='COMPLETED',wallet_transaction_id=v_wt_id,processed_at=now(),updated_at=now() where id=v_refund.id;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values(v_order.user_id,'refund.completed','order',p_order_id,jsonb_build_object('refund_id',v_refund.id,'amount',v_refund.amount,'source','SYSTEM'));
  return v_refund.id;
end $$;
revoke all on function public.create_system_refund(uuid,text) from public,anon,authenticated;
grant execute on function public.create_system_refund(uuid,text) to service_role;

-- Keep v14's automatic refund behavior, but route it through the refund center.
create or replace function public.finalize_ppob_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_order public.orders%rowtype;
  v_failed boolean;
  v_all_success boolean;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select exists(select 1 from public.ppob_transactions where order_id=p_order_id and status='FAILED'),
         not exists(select 1 from public.ppob_transactions where order_id=p_order_id and status <> 'SUCCESS')
  into v_failed,v_all_success;
  if v_all_success then
    update public.orders set status='COMPLETED',updated_at=now() where id=v_order.id and status='PROCESSING';
    return;
  end if;
  if not v_failed then return; end if;
  update public.orders set status='FAILED',updated_at=now() where id=v_order.id and status='PROCESSING';
  if v_order.status='PROCESSING' then
    perform public.create_system_refund(v_order.id,'Refund otomatis: transaksi PPOB gagal');
    update public.ppob_transactions set refunded_at=now(),updated_at=now()
      where order_id=v_order.id and status='FAILED' and refunded_at is null;
  end if;
end $$;
revoke all on function public.finalize_ppob_order(uuid) from public,anon,authenticated;
grant execute on function public.finalize_ppob_order(uuid) to service_role;
-- AIDIL STORE v40.1 - Reconciliation runner + refund retry hardening
-- Apply after v40.

-- Allow a failed refund to be retried safely. If the wallet ledger already
-- contains the refund entry, the function only finalizes the refund record.
create or replace function public.create_system_refund(p_order_id uuid, p_reason text default 'PPOB transaction failed')
returns uuid
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_order public.orders%rowtype;
  v_refund public.refunds%rowtype;
  v_wallet public.wallets%rowtype;
  v_existing_wallet_tx public.wallet_transactions%rowtype;
  v_before bigint;
  v_after bigint;
  v_wt_id uuid;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.total_amount <= 0 then raise exception 'INVALID_REFUND_AMOUNT'; end if;

  select * into v_refund from public.refunds where order_id=p_order_id for update;
  if found and v_refund.status='COMPLETED' then return v_refund.id; end if;
  if found and v_refund.status='PROCESSING' then return v_refund.id; end if;

  if not found then
    insert into public.refunds(order_id,user_id,amount,reason,status,source)
    values(p_order_id,v_order.user_id,v_order.total_amount,coalesce(nullif(trim(p_reason),''),'PPOB transaction failed'),'PROCESSING','SYSTEM')
    returning * into v_refund;
  else
    update public.refunds
      set status='PROCESSING', reason=coalesce(nullif(trim(p_reason),''),reason), updated_at=now()
      where id=v_refund.id
      returning * into v_refund;
  end if;

  select * into v_existing_wallet_tx
  from public.wallet_transactions
  where reference_type='order' and reference_id=p_order_id and type='REFUND'
  order by created_at asc limit 1;

  if found then
    update public.refunds
      set status='COMPLETED', wallet_transaction_id=v_existing_wallet_tx.id,
          processed_at=coalesce(processed_at,now()), updated_at=now()
      where id=v_refund.id;
    return v_refund.id;
  end if;

  select * into v_wallet from public.wallets where user_id=v_order.user_id for update;
  if not found then
    update public.refunds set status='FAILED',updated_at=now(),metadata=jsonb_build_object('error','WALLET_NOT_FOUND') where id=v_refund.id;
    return v_refund.id;
  end if;

  v_before := v_wallet.balance;
  v_after := v_before + v_refund.amount;
  update public.wallets set balance=v_after,updated_at=now() where id=v_wallet.id;
  insert into public.wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
  values(v_wallet.id,'REFUND',v_refund.amount,v_before,v_after,'order',p_order_id,v_refund.reason)
  returning id into v_wt_id;

  update public.refunds set status='COMPLETED',wallet_transaction_id=v_wt_id,processed_at=now(),updated_at=now() where id=v_refund.id;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values(v_order.user_id,'refund.completed','order',p_order_id,jsonb_build_object('refund_id',v_refund.id,'amount',v_refund.amount,'source','SYSTEM'));
  return v_refund.id;
exception when others then
  if v_refund.id is not null then
    update public.refunds set status='FAILED',updated_at=now(),metadata=jsonb_build_object('error',sqlerrm) where id=v_refund.id;
  end if;
  raise;
end $$;
revoke all on function public.create_system_refund(uuid,text) from public,anon,authenticated;
grant execute on function public.create_system_refund(uuid,text) to service_role;

-- Admin-side database reconciliation for provider-independent records. The API
-- runner supplements this with a live Pakasir Transaction Detail check.
create or replace function public.reconcile_internal_financial_record(p_source_type text, p_source_id uuid)
returns public.payment_reconciliation
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_result public.payment_reconciliation;
  v_topup public.topups%rowtype;
  v_order public.orders%rowtype;
  v_tx public.ppob_transactions%rowtype;
  v_wallet_tx public.wallet_transactions%rowtype;
  v_state text := 'REVIEW';
  v_discrepancy text := null;
  v_internal_amount bigint := null;
  v_wallet_amount bigint := null;
  v_provider_status text := null;
  v_provider_amount bigint := null;
begin
  if p_source_type='TOPUP' then
    select * into v_topup from public.topups where id=p_source_id;
    if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
    v_internal_amount := coalesce(v_topup.payment_amount,v_topup.amount);
    select * into v_wallet_tx from public.wallet_transactions where reference_type='topup' and reference_id=v_topup.id and type='TOPUP' order by created_at asc limit 1;
    if found then v_wallet_amount := v_wallet_tx.amount; end if;
    v_provider_status := case when v_topup.status='APPROVED' then 'completed' else lower(v_topup.status::text) end;
    if v_topup.status='APPROVED' and v_wallet_amount= v_topup.amount then
      v_state := 'MATCHED';
    elsif v_topup.status='APPROVED' and v_wallet_amount is null then
      v_state := 'MISSING_WALLET'; v_discrepancy := 'Top Up APPROVED tetapi ledger wallet tidak ditemukan';
    elsif v_wallet_amount is not null and v_topup.status<>'APPROVED' then
      v_state := 'MISMATCH'; v_discrepancy := 'Ledger wallet sudah masuk tetapi status Top Up belum APPROVED';
    else
      v_state := 'REVIEW'; v_discrepancy := 'Menunggu konfirmasi pembayaran/provider';
    end if;
  elsif p_source_type='ORDER' then
    select * into v_order from public.orders where id=p_source_id;
    if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
    v_internal_amount := v_order.total_amount;
    select * into v_wallet_tx from public.wallet_transactions where reference_type='order' and reference_id=v_order.id and type='PURCHASE' order by created_at asc limit 1;
    if found then v_wallet_amount := abs(v_wallet_tx.amount); end if;
    if v_order.payment_method='WALLET' then
      if v_order.status in ('PROCESSING','COMPLETED','FAILED','REFUNDED') and v_wallet_amount=v_order.total_amount then v_state := 'MATCHED';
      elsif v_wallet_amount is null then v_state := 'MISSING_WALLET'; v_discrepancy := 'Order wallet tidak memiliki ledger PURCHASE';
      else v_state := 'MISMATCH'; v_discrepancy := 'Nominal debit wallet berbeda dengan total order'; end if;
    else
      v_state := case when v_order.status in ('PENDING','PROCESSING') then 'REVIEW' else 'MATCHED' end;
      if v_order.status='FAILED' and v_order.paid_at is not null then v_state := 'REVIEW'; v_discrepancy := 'Gateway paid_at terisi tetapi order FAILED'; end if;
    end if;
  elsif p_source_type='PPOB' then
    select * into v_tx from public.ppob_transactions where id=p_source_id;
    if not found then raise exception 'SOURCE_NOT_FOUND'; end if;
    select * into v_order from public.orders where id=v_tx.order_id;
    v_internal_amount := coalesce(v_order.total_amount,0);
    v_provider_status := v_tx.provider_status;
    if v_order.payment_method='WALLET' then
      select * into v_wallet_tx from public.wallet_transactions where reference_type='order' and reference_id=v_order.id and type='PURCHASE' order by created_at asc limit 1;
      if found then v_wallet_amount := abs(v_wallet_tx.amount); end if;
    end if;
    if v_tx.status='SUCCESS' and v_order.status='COMPLETED' and (v_order.payment_method<>'WALLET' or v_wallet_amount=v_order.total_amount) then
      v_state := 'MATCHED';
    elsif v_tx.status='FAILED' and v_order.status in ('FAILED','REFUNDED') then
      if exists(select 1 from public.refunds r where r.order_id=v_order.id and r.status='COMPLETED') then v_state := 'MATCHED';
      else v_state := 'MISSING_WALLET'; v_discrepancy := 'PPOB gagal tetapi refund belum COMPLETED'; end if;
    elsif v_tx.status='PROCESSING' or v_tx.status='WAITING' then
      v_state := 'REVIEW'; v_discrepancy := 'Provider masih memproses transaksi';
    else
      v_state := 'MISMATCH'; v_discrepancy := 'Status order, PPOB, provider, atau refund tidak sinkron';
    end if;
  else
    raise exception 'INVALID_SOURCE_TYPE';
  end if;

  insert into public.payment_reconciliation(source_type,source_id,provider,internal_status,provider_status,internal_amount,provider_amount,wallet_amount,state,discrepancy,checked_at,metadata)
  values(p_source_type,p_source_id,case when p_source_type='TOPUP' then 'pakasir' when p_source_type='ORDER' then coalesce(v_order.gateway_method,'pakasir') else coalesce(v_tx.provider,'digiflazz') end,case when p_source_type='TOPUP' then v_topup.status::text when p_source_type='ORDER' then v_order.status::text else v_tx.status end,v_provider_status,v_internal_amount,v_provider_amount,v_wallet_amount,v_state,v_discrepancy,now(),jsonb_build_object('runner','v40.1'))
  on conflict(source_type,source_id) do update set provider=excluded.provider,internal_status=excluded.internal_status,provider_status=excluded.provider_status,internal_amount=excluded.internal_amount,provider_amount=excluded.provider_amount,wallet_amount=excluded.wallet_amount,state=excluded.state,discrepancy=excluded.discrepancy,checked_at=excluded.checked_at,metadata=excluded.metadata
  returning * into v_result;
  return v_result;
end $$;
revoke all on function public.reconcile_internal_financial_record(text,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_internal_financial_record(text,uuid) to service_role;
