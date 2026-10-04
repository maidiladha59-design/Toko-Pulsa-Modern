-- AIDIL STORE v79 — ID Order WAJIB & tervalidasi pada pembuatan tiket bantuan.
-- Mengganti create_support_ticket versi v68 (kategori PENGADUAN + prioritas otomatis):
--   * p_order_id kini wajib diisi (kosong ditolak sebagai ORDER_REQUIRED).
--   * Parameter diubah dari tipe uuid menjadi text lalu dikonversi ke uuid di dalam
--     fungsi, supaya format yang salah tertangkap sebagai INVALID_ORDER_ID (pesan
--     ramah), bukan error mentah Postgres 22P02 'invalid input syntax for type uuid'
--     yang sebelumnya lolos ke UI karena terjadi saat binding parameter.
-- Kolom support_tickets.order_id SENGAJA tidak dijadikan NOT NULL:
--   * tiket lama (impor legacy v41 dari tabel support_messages) bisa ber-order_id kosong;
--   * FK memakai "on delete set null", sehingga NOT NULL akan memblokir penghapusan order;
--   * kebijakan proyek: wajib diegakkan di validasi klien + RPC saja (tanpa ubah skema).
-- Additive/idempotent — aman dijalankan di atas v41 + v51 + v68.

drop function if exists public.create_support_ticket(text,text,uuid,text);

create or replace function public.create_support_ticket(
  p_subject text,
  p_category text,
  p_order_id text,
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
  v_order_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_subject,''))) < 3 or length(trim(p_subject)) > 160 then raise exception 'INVALID_SUBJECT'; end if;
  if length(trim(coalesce(p_message,''))) < 1 or length(trim(p_message)) > 5000 then raise exception 'INVALID_MESSAGE'; end if;
  if p_category not in ('PAYMENT','TOPUP','PPOB','ORDER','ACCOUNT','PENGADUAN','OTHER') then raise exception 'INVALID_CATEGORY'; end if;

  if p_order_id is null or trim(p_order_id) = '' then raise exception 'ORDER_REQUIRED'; end if;
  begin
    v_order_id := trim(p_order_id)::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID_ORDER_ID';
  end;

  -- Pengaduan konsumen formal (mis. saldo terpotong, produk/pulsa tidak masuk)
  -- selalu mendapat prioritas tinggi secara otomatis.
  if p_category = 'PENGADUAN' then v_priority := 'HIGH'; end if;

  select count(*) into v_open_count
  from public.support_tickets
  where user_id=v_user_id and status in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER');
  if v_open_count >= 5 then raise exception 'TOO_MANY_OPEN_TICKETS'; end if;

  if not exists (
    select 1 from public.orders o where o.id=v_order_id and o.user_id=v_user_id
  ) then raise exception 'ORDER_NOT_FOUND_OR_FORBIDDEN'; end if;

  insert into public.support_tickets(user_id,subject,category,priority,order_id,last_message_at)
  values(v_user_id,trim(p_subject),p_category,v_priority,v_order_id,now()) returning * into v_ticket;

  insert into public.support_ticket_messages(ticket_id,sender_id,sender_role,message,is_internal,created_at)
  values(v_ticket.id,v_user_id,'USER',trim(p_message),false,now());
  return v_ticket;
end $$;

revoke all on function public.create_support_ticket(text,text,text,text) from public,anon;
grant execute on function public.create_support_ticket(text,text,text,text) to authenticated,service_role;
