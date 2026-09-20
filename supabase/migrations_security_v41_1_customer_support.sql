-- ============================================================
-- AIDIL STORE v41.1 — Customer Support Security & Atomicity Patch
-- Tightens ticket mutation permissions and makes initial ticket
-- creation (ticket + first message) atomic.
-- ============================================================

-- Customers must never mutate ticket workflow/admin fields directly.
-- Status/assignment changes are performed through controlled functions.
drop policy if exists "support_tickets_update_own_or_admin" on public.support_tickets;

-- Explicitly remove broad UPDATE/DELETE privileges from the API roles.
-- SELECT/INSERT policies from v41 remain in force.
revoke update, delete on public.support_tickets from anon, authenticated;

-- The RPC below is the only customer path for creating a ticket + first message.
create or replace function public.create_support_ticket(
  p_subject text,
  p_category text,
  p_order_id uuid,
  p_message text
)
returns public.support_tickets
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.support_tickets;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if length(trim(coalesce(p_subject,''))) < 3 or length(trim(p_subject)) > 160 then
    raise exception 'INVALID_SUBJECT';
  end if;

  if length(trim(coalesce(p_message,''))) < 1 or length(trim(p_message)) > 5000 then
    raise exception 'INVALID_MESSAGE';
  end if;

  if p_category not in ('PAYMENT','TOPUP','PPOB','ORDER','ACCOUNT','OTHER') then
    raise exception 'INVALID_CATEGORY';
  end if;

  -- A customer may only attach an order that belongs to their own account.
  if p_order_id is not null and not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.user_id = v_user_id
  ) then
    raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN';
  end if;

  insert into public.support_tickets(user_id, subject, category, order_id, last_message_at)
  values(v_user_id, trim(p_subject), p_category, p_order_id, now())
  returning * into v_ticket;

  insert into public.support_ticket_messages(ticket_id, sender_id, sender_role, message, is_internal, created_at)
  values(v_ticket.id, v_user_id, 'USER', trim(p_message), false, now());

  return v_ticket;
end $$;

revoke all on function public.create_support_ticket(text,text,uuid,text) from public, anon;
grant execute on function public.create_support_ticket(text,text,uuid,text) to authenticated, service_role;

-- Harden the existing touch function: it must prove the caller is allowed
-- to touch the ticket and the declared sender role matches the caller.
create or replace function public.touch_support_ticket(p_ticket_id uuid, p_sender_role text, p_message text)
returns void
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_sender_role not in ('USER','ADMIN') then raise exception 'INVALID_SENDER_ROLE'; end if;

  if p_sender_role='ADMIN' then
    if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  else
    if not exists (
      select 1 from public.support_tickets t
      where t.id=p_ticket_id and t.user_id=v_user_id
    ) then
      raise exception 'TICKET_NOT_FOUND_OR_FORBIDDEN';
    end if;
  end if;

  update public.support_tickets
  set last_message_at=now(),
      updated_at=now(),
      status=case
        when p_sender_role='ADMIN' and status in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER') then 'WAITING_CUSTOMER'
        when p_sender_role='USER' and status in ('WAITING_CUSTOMER','RESOLVED') then 'OPEN'
        else status
      end,
      resolved_at=case when p_sender_role='USER' then null else resolved_at end,
      closed_at=case when p_sender_role='USER' then null else closed_at end
  where id=p_ticket_id;

  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
end $$;

revoke all on function public.touch_support_ticket(uuid,text,text) from public, anon;
grant execute on function public.touch_support_ticket(uuid,text,text) to authenticated, service_role;

-- Status changes stay admin-only through the existing controlled RPC.
revoke all on function public.set_support_ticket_status(uuid,text) from public, anon;
grant execute on function public.set_support_ticket_status(uuid,text) to authenticated, service_role;
