-- AIDIL STORE v50 — Operational Reconciliation & Refund Center
-- Apply after v49. Additive/idempotent.

create index if not exists payment_reconciliation_review_idx
  on public.payment_reconciliation(state, checked_at desc)
  where state <> 'MATCHED';

create index if not exists refunds_actionable_idx
  on public.refunds(status, created_at desc)
  where status in ('PENDING','FAILED');

-- Customer can request a refund for an eligible completed/failed order.
-- The request is only queued as PENDING; it never credits the wallet directly.
create or replace function public.request_customer_refund(p_order_id uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_order public.orders%rowtype;
  v_refund public.refunds%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and user_id=auth.uid() for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.total_amount <= 0 then raise exception 'INVALID_REFUND_AMOUNT'; end if;
  if v_order.status not in ('COMPLETED','FAILED','REFUNDED') then raise exception 'ORDER_NOT_ELIGIBLE_FOR_REFUND'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'REFUND_REASON_REQUIRED'; end if;

  select * into v_refund from public.refunds where order_id=p_order_id for update;
  if found then return v_refund.id; end if;

  insert into public.refunds(order_id,user_id,amount,reason,status,source,metadata)
  values(p_order_id,v_order.user_id,v_order.total_amount,trim(p_reason),'PENDING','CUSTOMER',jsonb_build_object('requested_by','customer'))
  returning * into v_refund;

  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),'refund.requested','order',p_order_id,jsonb_build_object('refund_id',v_refund.id,'amount',v_refund.amount,'source','CUSTOMER'));

  insert into public.notifications(user_id,title,message,reference_type,reference_id)
  values(v_order.user_id,'Permintaan refund diterima','Permintaan refund kamu sedang menunggu pemeriksaan admin.','refund',v_refund.id);

  return v_refund.id;
end $$;
revoke all on function public.request_customer_refund(uuid,text) from public,anon;
grant execute on function public.request_customer_refund(uuid,text) to authenticated;

-- Admin can move a customer PENDING request into PROCESSING. The actual wallet
-- credit remains guarded by create_system_refund and its idempotency rules.
create or replace function public.process_customer_refund(p_refund_id uuid)
returns uuid
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_refund public.refunds%rowtype;
  v_order public.orders%rowtype;
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_refund from public.refunds where id=p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  if v_refund.status not in ('PENDING','FAILED') then raise exception 'REFUND_NOT_ACTIONABLE'; end if;
  select * into v_order from public.orders where id=v_refund.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  -- Use the established idempotent refund routine for wallet credit.
  return public.create_system_refund(v_order.id,v_refund.reason);
end $$;
revoke all on function public.process_customer_refund(uuid) from public,anon,authenticated;
grant execute on function public.process_customer_refund(uuid) to service_role;
