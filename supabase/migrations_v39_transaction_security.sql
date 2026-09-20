-- AIDIL STORE v39 - Transaction Security
-- Apply after v38.
-- Transaction PIN is stored only as a salted scrypt hash. Never store plaintext PIN.

create table if not exists public.user_transaction_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text,
  pin_failed_attempts integer not null default 0 check (pin_failed_attempts >= 0),
  pin_locked_until timestamptz,
  pin_changed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_transaction_security enable row level security;
drop policy if exists "transaction_security_own_select" on public.user_transaction_security;
create policy "transaction_security_own_select" on public.user_transaction_security
  for select using (user_id = auth.uid() or is_admin());

create or replace function public.register_transaction_pin_failure(p_user_id uuid)
returns table(failed_attempts integer, locked_until timestamptz)
language plpgsql security definer set search_path=public,extensions
as $$
declare v integer; v_lock timestamptz;
begin
  insert into public.user_transaction_security(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select pin_failed_attempts into v from public.user_transaction_security where user_id=p_user_id for update;
  v := least(v + 1, 5);
  if v >= 5 then v_lock := now() + interval '15 minutes'; else v_lock := null; end if;
  update public.user_transaction_security set pin_failed_attempts=v,pin_locked_until=v_lock,updated_at=now() where user_id=p_user_id;
  return query select v,v_lock;
end $$;

create or replace function public.reset_transaction_pin_failures(p_user_id uuid)
returns void
language plpgsql security definer set search_path=public,extensions
as $$
begin
  update public.user_transaction_security set pin_failed_attempts=0,pin_locked_until=null,updated_at=now() where user_id=p_user_id;
end $$;

revoke all on function public.register_transaction_pin_failure(uuid) from public,anon,authenticated;
revoke all on function public.reset_transaction_pin_failures(uuid) from public,anon,authenticated;
grant execute on function public.register_transaction_pin_failure(uuid) to service_role;
grant execute on function public.reset_transaction_pin_failures(uuid) to service_role;

create index if not exists user_transaction_security_lock_idx
  on public.user_transaction_security(pin_locked_until);
