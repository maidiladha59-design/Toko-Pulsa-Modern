-- AIDIL STORE v34 — Automatic Pakasir Wallet Top Up
-- Apply after the existing v33 migrations. Do NOT rerun schema.sql.

alter table public.topups
  add column if not exists idempotency_key text,
  add column if not exists provider text,
  add column if not exists provider_order_id text,
  add column if not exists payment_method text,
  add column if not exists payment_number text,
  add column if not exists gateway_fee bigint,
  add column if not exists gateway_total_payment bigint,
  add column if not exists expires_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists webhook_event_key text;

create unique index if not exists topups_idempotency_key_uidx on public.topups(idempotency_key) where idempotency_key is not null;
create unique index if not exists topups_provider_order_id_uidx on public.topups(provider_order_id) where provider_order_id is not null;
create unique index if not exists topups_webhook_event_key_uidx on public.topups(webhook_event_key) where webhook_event_key is not null;

create or replace function public.confirm_pakasir_topup(
  p_topup_id uuid,
  p_payment_method text,
  p_completed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_topup public.topups%rowtype;
  v_wallet public.wallets%rowtype;
begin
  select * into v_topup from public.topups where id = p_topup_id for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if v_topup.status = 'APPROVED' then return; end if;
  if v_topup.status not in ('PENDING','VERIFYING') then raise exception 'TOPUP_NOT_PAYABLE'; end if;
  if coalesce(v_topup.provider, '') <> 'pakasir' then raise exception 'INVALID_TOPUP_PROVIDER'; end if;

  insert into public.wallets(user_id, balance)
  values (v_topup.user_id, 0)
  on conflict (user_id) do nothing;

  select * into v_wallet from public.wallets where user_id = v_topup.user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  update public.wallets
  set balance = balance + v_topup.amount, updated_at = now()
  where id = v_wallet.id;

  insert into public.wallet_transactions(
    wallet_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description
  ) values (
    v_wallet.id, 'TOPUP', v_topup.amount, v_wallet.balance,
    v_wallet.balance + v_topup.amount, 'topup', v_topup.id,
    'Top Up otomatis via Pakasir'
  );

  update public.topups
  set status = 'APPROVED', payment_method = coalesce(p_payment_method, payment_method),
      paid_at = coalesce(p_completed_at, now()), reviewed_at = coalesce(reviewed_at, now()),
      updated_at = now()
  where id = v_topup.id;

  insert into public.audit_logs(actor_id, action, target_type, target_id, metadata)
  values (v_topup.user_id, 'topup.pakasir_paid', 'topup', v_topup.id,
          jsonb_build_object('provider','pakasir','amount',v_topup.amount,'payment_method',p_payment_method));

  insert into public.notifications(user_id, title, message, reference_type, reference_id)
  values (v_topup.user_id, 'Top Up Berhasil', 'Saldo ' || v_topup.amount || ' berhasil ditambahkan otomatis melalui Pakasir.', 'topup', v_topup.id);
end;
$$;

revoke all on function public.confirm_pakasir_topup(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_pakasir_topup(uuid,text,timestamptz) to service_role;
