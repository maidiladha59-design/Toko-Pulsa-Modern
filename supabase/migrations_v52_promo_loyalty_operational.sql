-- AIDIL STORE v52 — Promo, Voucher & Loyalty Operational
-- Mengaktifkan loyalty secara otomatis untuk order yang benar-benar COMPLETED.
-- Poin dihitung server-side: 1 poin / Rp1.000 nilai order, dikalikan multiplier level.
-- Ledger idempotent sehingga retry/status update tidak menggandakan poin.

create index if not exists loyalty_ledger_reference_idx
  on public.loyalty_ledger(reference_type, reference_id);

create or replace function public.award_loyalty_points_internal(
  p_user_id uuid,
  p_points bigint,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  lvl uuid;
  inserted_count integer;
begin
  if p_user_id is null or p_points <= 0 or p_reference_id is null then return true; end if;

  insert into public.loyalty_accounts(user_id)
  values(p_user_id)
  on conflict do nothing;

  insert into public.loyalty_ledger(user_id,points,reason,reference_type,reference_id)
  values(p_user_id,p_points,coalesce(nullif(trim(p_reason),''),'Order selesai'),p_reference_type,p_reference_id)
  on conflict(user_id,reference_type,reference_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then return true; end if;

  update public.loyalty_accounts
    set points=points+p_points,
        lifetime_points=lifetime_points+p_points,
        updated_at=now()
    where user_id=p_user_id;

  select id into lvl
  from public.loyalty_levels
  where is_active
    and min_points <= (select lifetime_points from public.loyalty_accounts where user_id=p_user_id)
  order by min_points desc
  limit 1;

  update public.loyalty_accounts set level_id=lvl,updated_at=now() where user_id=p_user_id;
  return true;
end $$;

revoke all on function public.award_loyalty_points_internal(uuid,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function public.award_loyalty_points_internal(uuid,bigint,text,text,uuid) to service_role;

create or replace function public.award_loyalty_for_completed_order()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  base_points bigint;
  multiplier numeric(8,2) := 1;
  earned_points bigint;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then return new; end if;
  if new.user_id is null or coalesce(new.total_amount,0) <= 0 then return new; end if;

  select coalesce(ll.multiplier,1)
    into multiplier
  from public.loyalty_accounts la
  left join public.loyalty_levels ll on ll.id=la.level_id and ll.is_active
  where la.user_id=new.user_id;

  base_points := floor(coalesce(new.total_amount,0) / 1000);
  earned_points := floor(base_points * coalesce(multiplier,1));

  perform public.award_loyalty_points_internal(
    new.user_id,
    earned_points,
    'Poin dari pesanan selesai',
    'ORDER_COMPLETED',
    new.id
  );
  return new;
end $$;

drop trigger if exists orders_award_loyalty_points on public.orders;
create trigger orders_award_loyalty_points
after update of status,total_amount on public.orders
for each row execute function public.award_loyalty_for_completed_order();

revoke all on function public.award_loyalty_for_completed_order() from public,anon,authenticated;

-- Read-only customer summary; mutation remains server/trigger controlled.
create or replace function public.get_my_loyalty_summary()
returns table(points bigint,lifetime_points bigint,level_name text,multiplier numeric)
language sql
security definer
set search_path=public
as $$
  select
    coalesce(la.points,0),
    coalesce(la.lifetime_points,0),
    coalesce(ll.name,'Bronze'),
    coalesce(ll.multiplier,1)
  from (select auth.uid() as user_id) u
  left join public.loyalty_accounts la on la.user_id=u.user_id
  left join public.loyalty_levels ll on ll.id=la.level_id;
$$;
revoke all on function public.get_my_loyalty_summary() from public,anon;
grant execute on function public.get_my_loyalty_summary() to authenticated;
