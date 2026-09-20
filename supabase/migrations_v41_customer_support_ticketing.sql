-- ============================================================
-- AIDIL STORE v41 — Customer Support & Ticketing
-- Threaded support tickets with category, priority, status,
-- optional order reference, admin assignment and message history.
-- ============================================================

create sequence if not exists public.support_ticket_number_seq start 1000;

create table if not exists public.support_tickets (
  id uuid primary key default uuid_generate_v4(),
  ticket_number text not null unique default ('TKT-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.support_ticket_number_seq')::text,5,'0')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  subject text not null check (length(trim(subject)) between 3 and 160),
  category text not null default 'OTHER' check (category in ('PAYMENT','TOPUP','PPOB','ORDER','ACCOUNT','OTHER')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED')),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, priority, last_message_at desc);
create index if not exists support_tickets_order_idx on public.support_tickets(order_id);

create table if not exists public.support_ticket_messages (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('USER','ADMIN')),
  message text not null check (length(trim(message)) between 1 and 5000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at asc);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists "support_tickets_select_own_or_admin" on public.support_tickets;
create policy "support_tickets_select_own_or_admin" on public.support_tickets
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own" on public.support_tickets
  for insert with check (user_id = auth.uid());

drop policy if exists "support_tickets_update_own_or_admin" on public.support_tickets;
create policy "support_tickets_update_own_or_admin" on public.support_tickets
  for update using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "support_ticket_messages_select_own_or_admin" on public.support_ticket_messages;
create policy "support_ticket_messages_select_own_or_admin" on public.support_ticket_messages
  for select using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (t.user_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "support_ticket_messages_insert_user_or_admin" on public.support_ticket_messages;
create policy "support_ticket_messages_insert_user_or_admin" on public.support_ticket_messages
  for insert with check (
    sender_id = auth.uid()
    and (
      (sender_role = 'USER' and is_internal = false and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()))
      or
      (sender_role = 'ADMIN' and public.is_admin())
    )
  );

-- Keep the legacy support_messages feature intact while importing old tickets.
do $$
declare
  r record;
  v_ticket_id uuid;
begin
  if to_regclass('public.support_messages') is not null then
    for r in select * from public.support_messages loop
      if not exists (select 1 from public.support_tickets t where t.user_id=r.user_id and t.subject=r.subject and t.created_at=r.created_at) then
        insert into public.support_tickets(user_id,subject,status,priority,last_message_at,created_at,updated_at)
        values(r.user_id,r.subject,
          case when r.status='CLOSED' then 'CLOSED' when r.status='REPLIED' then 'WAITING_CUSTOMER' else 'OPEN' end,
          'NORMAL',r.created_at,r.created_at,r.updated_at)
        returning id into v_ticket_id;

        insert into public.support_ticket_messages(ticket_id,sender_id,sender_role,message,is_internal,created_at)
        values(v_ticket_id,r.user_id,'USER',r.message,false,r.created_at);

        if nullif(trim(coalesce(r.admin_reply,'')),'') is not null and r.replied_by is not null then
          insert into public.support_ticket_messages(ticket_id,sender_id,sender_role,message,is_internal,created_at)
          values(v_ticket_id,r.replied_by,'ADMIN',r.admin_reply,false,coalesce(r.replied_at,r.updated_at));
        end if;
      end if;
    end loop;
  end if;
end $$;

create or replace function public.touch_support_ticket(p_ticket_id uuid, p_sender_role text, p_message text)
returns void
language plpgsql security definer set search_path=public,extensions
as $$
begin
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
end $$;

revoke all on function public.touch_support_ticket(uuid,text,text) from public,anon,authenticated;
grant execute on function public.touch_support_ticket(uuid,text,text) to authenticated,service_role;

-- Validation helper for admin/customer UI and API routes.
create or replace function public.set_support_ticket_status(p_ticket_id uuid, p_status text)
returns public.support_tickets
language plpgsql security definer set search_path=public,extensions
as $$
declare v_ticket public.support_tickets;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_status not in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','RESOLVED','CLOSED') then raise exception 'INVALID_STATUS'; end if;
  update public.support_tickets
  set status=p_status,
      resolved_at=case when p_status='RESOLVED' then coalesce(resolved_at,now()) when p_status in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER') then null else resolved_at end,
      closed_at=case when p_status='CLOSED' then coalesce(closed_at,now()) else null end,
      updated_at=now()
  where id=p_ticket_id
  returning * into v_ticket;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  return v_ticket;
end $$;

revoke all on function public.set_support_ticket_status(uuid,text) from public,anon;
grant execute on function public.set_support_ticket_status(uuid,text) to authenticated,service_role;

