-- AIDIL STORE v51 — Support & Ticketing Operational Hardening
-- Additive/idempotent patch for the existing v41 ticket center.

create index if not exists support_tickets_actionable_idx
  on public.support_tickets(status, last_message_at desc)
  where status in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER');

-- Prevent customers from creating an unbounded number of active tickets.
create or replace function public.create_support_ticket(
  p_subject text,
  p_category text,
  p_order_id uuid,
  p_message text
)
returns public.support_tickets
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_ticket public.support_tickets;
  v_open_count integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_subject,''))) < 3 or length(trim(p_subject)) > 160 then raise exception 'INVALID_SUBJECT'; end if;
  if length(trim(coalesce(p_message,''))) < 1 or length(trim(p_message)) > 5000 then raise exception 'INVALID_MESSAGE'; end if;
  if p_category not in ('PAYMENT','TOPUP','PPOB','ORDER','ACCOUNT','OTHER') then raise exception 'INVALID_CATEGORY'; end if;

  select count(*) into v_open_count
  from public.support_tickets
  where user_id=v_user_id and status in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER');
  if v_open_count >= 5 then raise exception 'TOO_MANY_OPEN_TICKETS'; end if;

  if p_order_id is not null and not exists (
    select 1 from public.orders o where o.id=p_order_id and o.user_id=v_user_id
  ) then raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN'; end if;

  insert into public.support_tickets(user_id,subject,category,order_id,last_message_at)
  values(v_user_id,trim(p_subject),p_category,p_order_id,now()) returning * into v_ticket;

  insert into public.support_ticket_messages(ticket_id,sender_id,sender_role,message,is_internal,created_at)
  values(v_ticket.id,v_user_id,'USER',trim(p_message),false,now());
  return v_ticket;
end $$;

revoke all on function public.create_support_ticket(text,text,uuid,text) from public,anon;
grant execute on function public.create_support_ticket(text,text,uuid,text) to authenticated,service_role;

-- Customer can close their own ticket; they can reopen it later if needed.
create or replace function public.close_support_ticket(p_ticket_id uuid)
returns public.support_tickets
language plpgsql security definer set search_path=public,extensions
as $$
declare v_ticket public.support_tickets;
begin
  update public.support_tickets
  set status='CLOSED', closed_at=now(), updated_at=now()
  where id=p_ticket_id and user_id=auth.uid() and status <> 'CLOSED'
  returning * into v_ticket;
  if not found then raise exception 'TICKET_NOT_FOUND_OR_ALREADY_CLOSED'; end if;
  return v_ticket;
end $$;
revoke all on function public.close_support_ticket(uuid) from public,anon;
grant execute on function public.close_support_ticket(uuid) to authenticated;

create or replace function public.reopen_support_ticket(p_ticket_id uuid)
returns public.support_tickets
language plpgsql security definer set search_path=public,extensions
as $$
declare v_ticket public.support_tickets;
begin
  update public.support_tickets
  set status='OPEN', closed_at=null, resolved_at=null, last_message_at=now(), updated_at=now()
  where id=p_ticket_id and user_id=auth.uid() and status='CLOSED'
  returning * into v_ticket;
  if not found then raise exception 'TICKET_NOT_FOUND_OR_NOT_COPENABLE'; end if;
  return v_ticket;
end $$;
revoke all on function public.reopen_support_ticket(uuid) from public,anon;
grant execute on function public.reopen_support_ticket(uuid) to authenticated;

-- Admin-only priority and assignment controls.
create or replace function public.admin_update_support_ticket(
  p_ticket_id uuid,
  p_priority text default null,
  p_assigned_to uuid default null
)
returns public.support_tickets
language plpgsql security definer set search_path=public,extensions
as $$
declare v_ticket public.support_tickets;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_priority is not null and p_priority not in ('LOW','NORMAL','HIGH','URGENT') then raise exception 'INVALID_PRIORITY'; end if;
  if p_assigned_to is not null and not exists (select 1 from public.profiles p where p.id=p_assigned_to and p.role in ('ADMIN','SUPER_ADMIN')) then raise exception 'INVALID_ASSIGNEE'; end if;
  update public.support_tickets
  set priority=coalesce(p_priority,priority), assigned_to=case when p_assigned_to is null then assigned_to else p_assigned_to end, updated_at=now()
  where id=p_ticket_id returning * into v_ticket;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  return v_ticket;
end $$;
revoke all on function public.admin_update_support_ticket(uuid,text,uuid) from public,anon;
grant execute on function public.admin_update_support_ticket(uuid,text,uuid) to authenticated,service_role;

-- Notify the other side whenever a public ticket message is posted.
create or replace function public.notify_support_ticket_message()
returns trigger language plpgsql security definer set search_path=public,extensions
as $$
declare v_user uuid; v_title text; v_message text; v_type text := 'SYSTEM'; v_ticket_no text;
begin
  if new.is_internal then return new; end if;
  select t.user_id,t.ticket_number into v_user,v_ticket_no from public.support_tickets t where t.id=new.ticket_id;
  if v_user is null then return new; end if;
  if new.sender_role='ADMIN' then
    v_title := 'Balasan bantuan baru';
    v_message := 'Admin membalas tiket '||v_ticket_no||'. Buka Pusat Bantuan untuk melihat balasan.';
  elsif new.sender_role='USER' then
    v_title := 'Tiket bantuan baru';
    v_message := 'Ada pesan baru dari pelanggan pada tiket '||v_ticket_no||'.';
  else return new; end if;

  if new.sender_role='ADMIN' then
    insert into public.notifications(user_id,type,title,message,reference_type,reference_id)
    values(v_user,'SYSTEM',v_title,v_message,'support_ticket',new.ticket_id);
  else
    -- Admins are not a customer-facing notification audience in the shared notification table;
    -- the admin panel refresh remains the source of truth.
    null;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_support_ticket_message on public.support_ticket_messages;
create trigger trg_notify_support_ticket_message
after insert on public.support_ticket_messages
for each row execute function public.notify_support_ticket_message();
