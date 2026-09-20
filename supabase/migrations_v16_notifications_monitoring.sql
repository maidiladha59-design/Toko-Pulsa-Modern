-- AIDIL STORE v16: user notifications + PPOB monitoring.
-- Run after v14/v15 migrations.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'INFO' check (type in ('INFO','PAYMENT','PPOB','REFUND','SYSTEM')),
  title text not null,
  message text not null,
  order_id uuid references public.orders(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id, is_read, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_select_own on public.notifications for select using (auth.uid() = user_id);
create policy notifications_update_own on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.notify_order_status_change()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_title text; v_message text; v_type text := 'PAYMENT';
begin
  if old.status is not distinct from new.status then return new; end if;
  if new.status='PROCESSING' then v_title:='Pembayaran diterima'; v_message:='Pembayaran pesanan '||new.order_number||' sudah diterima dan sedang diproses.';
  elsif new.status='COMPLETED' then v_title:='Pesanan berhasil'; v_message:='Pesanan '||new.order_number||' berhasil diproses.';
  elsif new.status='FAILED' then v_title:='Pesanan gagal'; v_message:='Pesanan '||new.order_number||' gagal diproses. Jika pembayaran sudah terpotong, sistem akan memproses pengembalian dana sesuai status transaksi.'; v_type:='SYSTEM';
  elsif new.status='REFUNDED' then v_title:='Dana dikembalikan'; v_message:='Dana untuk pesanan '||new.order_number||' sudah dikembalikan ke saldo.'; v_type:='REFUND';
  else return new; end if;
  insert into public.notifications(user_id,type,title,message,order_id) values(new.user_id,v_type,v_title,v_message,new.id);
  return new;
end; $$;

drop trigger if exists trg_notify_order_status on public.orders;
create trigger trg_notify_order_status after update of status on public.orders for each row execute function public.notify_order_status_change();

create or replace function public.notify_ppob_status_change()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare v_user uuid; v_order_number text; v_title text; v_message text;
begin
  if old.status is not distinct from new.status then return new; end if;
  select o.user_id,o.order_number into v_user,v_order_number from orders o where o.id=new.order_id;
  if v_user is null then return new; end if;
  if new.status='SUCCESS' then v_title:='PPOB berhasil'; v_message:='Transaksi PPOB untuk '||new.customer_no||' berhasil. SN/token tersedia di detail pesanan.';
  elsif new.status='FAILED' then v_title:='PPOB gagal'; v_message:='Transaksi PPOB untuk '||new.customer_no||' gagal diproses.';
  else return new; end if;
  insert into notifications(user_id,type,title,message,order_id) values(v_user,'PPOB',v_title,v_message,new.order_id);
  return new;
end; $$;

drop trigger if exists trg_notify_ppob_status on public.ppob_transactions;
create trigger trg_notify_ppob_status after update of status on public.ppob_transactions for each row execute function public.notify_ppob_status_change();

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path=public,extensions as $$
declare v_count integer;
begin
  update notifications set is_read=true, read_at=coalesce(read_at,now())
  where user_id=auth.uid() and is_read=false and (p_ids is null or id=any(p_ids));
  get diagnostics v_count=row_count; return v_count;
end; $$;
revoke all on function public.mark_notifications_read(uuid[]) from public,anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
