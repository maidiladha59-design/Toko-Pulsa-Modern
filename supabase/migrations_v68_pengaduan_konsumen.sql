-- AIDIL STORE v68 — Jalur Pengaduan Konsumen formal.
-- Menambahkan kategori 'PENGADUAN' yang terpisah dari tiket bantuan biasa,
-- dengan prioritas otomatis HIGH sesuai kewajiban penyelesaian keluhan konsumen
-- (mis. saldo terpotong tapi produk/pulsa tidak masuk).
-- Additive/idempotent — aman dijalankan di atas v41 + v51.

alter table public.support_tickets
  drop constraint if exists support_tickets_category_check;

alter table public.support_tickets
  add constraint support_tickets_category_check
  check (category in ('PAYMENT','TOPUP','PPOB','ORDER','ACCOUNT','PENGADUAN','OTHER'));

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
  v_priority text := 'NORMAL';
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_subject,''))) < 3 or length(trim(p_subject)) > 160 then raise exception 'INVALID_SUBJECT'; end if;
  if length(trim(coalesce(p_message,''))) < 1 or length(trim(p_message)) > 5000 then raise exception 'INVALID_MESSAGE'; end if;
  if p_category not in ('PAYMENT','TOPUP','PPOB','ORDER','ACCOUNT','PENGADUAN','OTHER') then raise exception 'INVALID_CATEGORY'; end if;

  -- Pengaduan konsumen formal (mis. saldo terpotong, produk/pulsa tidak masuk)
  -- selalu mendapat prioritas tinggi secara otomatis.
  if p_category = 'PENGADUAN' then v_priority := 'HIGH'; end if;

  select count(*) into v_open_count
  from public.support_tickets
  where user_id=v_user_id and status in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER');
  if v_open_count >= 5 then raise exception 'TOO_MANY_OPEN_TICKETS'; end if;

  if p_order_id is not null and not exists (
    select 1 from public.orders o where o.id=p_order_id and o.user_id=v_user_id
  ) then raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN'; end if;

  insert into public.support_tickets(user_id,subject,category,priority,order_id,last_message_at)
  values(v_user_id,trim(p_subject),p_category,v_priority,p_order_id,now()) returning * into v_ticket;

  insert into public.support_ticket_messages(ticket_id,sender_id,sender_role,message,is_internal,created_at)
  values(v_ticket.id,v_user_id,'USER',trim(p_message),false,now());
  return v_ticket;
end $$;

revoke all on function public.create_support_ticket(text,text,uuid,text) from public,anon;
grant execute on function public.create_support_ticket(text,text,uuid,text) to authenticated,service_role;
