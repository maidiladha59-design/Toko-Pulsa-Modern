-- AIDIL STORE v14: PPOB reliability, safe retry, and automatic refund.
-- Run after v9-v13 migrations.

alter table public.ppob_transactions
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists refunded_at timestamptz;

create index if not exists ppob_transactions_retry_idx
  on public.ppob_transactions(status, next_retry_at, last_attempt_at);

-- Idempotent finalizer. If a paid PPOB order fails, return the product amount
-- exactly once to the user's wallet. This covers both wallet and gateway-paid orders.
create or replace function public.finalize_ppob_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_order orders%rowtype;
  v_wallet wallets%rowtype;
  v_before bigint;
  v_after bigint;
  v_failed boolean;
  v_all_success boolean;
begin
  select * into v_order from orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select
    exists(select 1 from ppob_transactions where order_id=p_order_id and status='FAILED'),
    not exists(select 1 from ppob_transactions where order_id=p_order_id and status <> 'SUCCESS')
  into v_failed, v_all_success;

  if v_all_success then
    update orders set status='COMPLETED', updated_at=now()
      where id=v_order.id and status='PROCESSING';
    return;
  end if;

  if not v_failed then return; end if;

  update orders set status='FAILED', updated_at=now()
    where id=v_order.id and status='PROCESSING';

  -- Only one refund can win because the order row is locked above.
  if v_order.status='PROCESSING' then
    select * into v_wallet from wallets where user_id=v_order.user_id for update;
    if not found then raise exception 'WALLET_NOT_FOUND'; end if;
    v_before := v_wallet.balance;
    v_after := v_before + v_order.total_amount;
    update wallets set balance=v_after, updated_at=now() where id=v_wallet.id;
    insert into wallet_transactions(wallet_id,type,amount,balance_before,balance_after,reference_type,reference_id,description)
    values(v_wallet.id,'REFUND',v_order.total_amount,v_before,v_after,'order',v_order.id,'Refund otomatis transaksi PPOB gagal');
    insert into audit_logs(actor_id,action,target_type,target_id,metadata)
    values(v_order.user_id,'ppob.auto_refund','order',v_order.id,jsonb_build_object('amount',v_order.total_amount));
    update ppob_transactions set refunded_at=now(), updated_at=now()
      where order_id=v_order.id and status='FAILED' and refunded_at is null;
  end if;
end; $$;
revoke all on function public.finalize_ppob_order(uuid) from public, anon, authenticated;
grant execute on function public.finalize_ppob_order(uuid) to service_role;

-- Queue helper for a scheduled worker. Retry only after a cooldown and while pending.
create or replace function public.claim_ppob_retry_batch(p_limit integer default 20)
returns table(id uuid, order_id uuid)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return query
  with candidates as (
    select t.id
    from ppob_transactions t
    where t.status='PROCESSING'
      and coalesce(t.attempt_count,0) < 3
      and coalesce(t.next_retry_at, t.last_attempt_at + interval '2 minutes', now()) <= now()
    order by coalesce(t.next_retry_at, t.last_attempt_at, t.created_at)
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,20),100))
  )
  update ppob_transactions t
  set next_retry_at=now()+interval '2 minutes', updated_at=now()
  from candidates c
  where t.id=c.id
  returning t.id,t.order_id;
end; $$;
revoke all on function public.claim_ppob_retry_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_ppob_retry_batch(integer) to service_role;
