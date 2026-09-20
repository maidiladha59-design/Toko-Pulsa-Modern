-- AIDIL STORE — Robust Top Up Approval Fix
-- Jalankan FILE INI SAJA pada database lama yang sudah menjalankan schema.sql.
-- Jangan jalankan schema.sql ulang.

create or replace function public.approve_topup(p_topup_id uuid, p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup topups%rowtype;
  v_wallet wallets%rowtype;
begin
  -- Validasi sesi Supabase. SQL Editor tidak mempunyai sesi browser,
  -- sehingga pemanggilan manual dari SQL Editor memang akan menghasilkan
  -- UNAUTHENTICATED. Pemanggilan dari API saat admin login memakai sesi user.
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_admin_id <> auth.uid() then
    raise exception 'ADMIN_ID_MISMATCH';
  end if;

  if not exists (
    select 1
    from profiles
    where id = auth.uid()
      and role in ('ADMIN', 'SUPER_ADMIN')
  ) then
    raise exception 'ADMIN_ONLY';
  end if;

  select *
  into v_topup
  from topups
  where id = p_topup_id
  for update;

  if not found then
    raise exception 'TOPUP_NOT_FOUND';
  end if;

  if v_topup.status not in ('PENDING', 'VERIFYING') then
    raise exception 'TOPUP_ALREADY_PROCESSED';
  end if;

  -- Akun lama bisa saja memiliki Top Up tetapi belum mempunyai wallet.
  -- Pastikan wallet tersedia sebelum menambah saldo.
  insert into wallets (user_id, balance)
  values (v_topup.user_id, 0)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from wallets
  where user_id = v_topup.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  update wallets
  set balance = balance + v_topup.amount,
      updated_at = now()
  where id = v_wallet.id;

  insert into wallet_transactions (
    wallet_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description
  )
  values (
    v_wallet.id,
    'TOPUP',
    v_topup.amount,
    v_wallet.balance,
    v_wallet.balance + v_topup.amount,
    'topup',
    v_topup.id,
    'Top up disetujui'
  );

  update topups
  set status = 'APPROVED',
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      updated_at = now()
  where id = p_topup_id;

  insert into audit_logs (actor_id, action, target_type, target_id)
  values (p_admin_id, 'topup.approve', 'topup', p_topup_id);
end;
$$;

revoke all on function public.approve_topup(uuid, uuid) from public;
grant execute on function public.approve_topup(uuid, uuid) to authenticated;
