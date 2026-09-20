-- AIDIL STORE v25: atomic per-transaction provider claim.
-- Prevents concurrent wallet checkout, webhook, cron and admin retry from
-- submitting the same provider transaction more than once.

create or replace function public.claim_ppob_transaction(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_claimed integer;
begin
  update public.ppob_transactions
  set status='PROCESSING',
      attempt_count=coalesce(attempt_count,0)+1,
      last_attempt_at=now(),
      next_retry_at=now()+interval '2 minutes',
      updated_at=now()
  where id=p_transaction_id
    and status in ('WAITING','PROCESSING')
    and customer_no is not null
    and customer_no <> 'pending-target'
    and coalesce(attempt_count,0) < 3
    and (
      status='WAITING'
      or next_retry_at is null
      or next_retry_at <= now()
    );

  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end; $$;

revoke all on function public.claim_ppob_transaction(uuid) from public, anon, authenticated;
grant execute on function public.claim_ppob_transaction(uuid) to service_role;
