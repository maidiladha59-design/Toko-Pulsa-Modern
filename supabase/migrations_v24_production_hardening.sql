-- AIDIL STORE v24: production hardening / idempotent refund / worker claims.
-- Run after v19 and v21 migrations.

-- A refund for an order may only be recorded once in the wallet ledger.
create unique index if not exists wallet_transactions_order_refund_once_idx
  on public.wallet_transactions(reference_type, reference_id)
  where type = 'REFUND' and reference_type = 'order' and reference_id is not null;

-- Claim both freshly WAITING and due PROCESSING transactions atomically.
-- This prevents the cron worker and another worker from selecting the same row.
create or replace function public.claim_ppob_worker_batch(p_limit integer default 20)
returns table(id uuid, order_id uuid)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return query
  with candidates as (
    select t.id
    from public.ppob_transactions t
    where t.status in ('WAITING','PROCESSING')
      and t.customer_no is not null
      and t.customer_no <> 'pending-target'
      and coalesce(t.attempt_count,0) < 3
      and (
        t.status = 'WAITING'
        or coalesce(t.next_retry_at, t.last_attempt_at + interval '2 minutes', now()) <= now()
      )
    order by case when t.status='WAITING' then 0 else 1 end,
             coalesce(t.next_retry_at, t.created_at)
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,20),100))
  )
  update public.ppob_transactions t
  set status='PROCESSING',
      next_retry_at=now()+interval '2 minutes',
      updated_at=now()
  from candidates c
  where t.id=c.id
  returning t.id,t.order_id;
end; $$;

revoke all on function public.claim_ppob_worker_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_ppob_worker_batch(integer) to service_role;
