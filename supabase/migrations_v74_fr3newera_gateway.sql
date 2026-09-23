-- AIDIL STORE v74 — Ganti gateway pembayaran dari Pakasir ke FR3 NEWERA
-- Apply setelah migration v34 (dan seterusnya) sudah berjalan. File migration
-- lama (mis. migrations_v34_pakasir_wallet_topup.sql) TIDAK diubah — migration
-- ini hanya menambah fungsi baru (confirm_gateway_topup) yang menggantikan
-- confirm_pakasir_topup, supaya riwayat migration tetap append-only/aman diulang.

create or replace function public.confirm_gateway_topup(
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
  -- 'pakasir' tetap diterima untuk kompatibilitas mundur terhadap baris lama
  -- yang mungkin masih berstatus PENDING/VERIFYING saat migration ini dijalankan.
  if coalesce(v_topup.provider, '') not in ('fr3newera', 'pakasir') then
    raise exception 'INVALID_TOPUP_PROVIDER';
  end if;

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
    'Top Up otomatis via FR3 NEWERA'
  );

  update public.topups
  set status = 'APPROVED', payment_method = coalesce(p_payment_method, payment_method),
      paid_at = coalesce(p_completed_at, now()), reviewed_at = coalesce(reviewed_at, now()),
      updated_at = now()
  where id = v_topup.id;

  insert into public.audit_logs(actor_id, action, target_type, target_id, metadata)
  values (v_topup.user_id, 'topup.gateway_paid', 'topup', v_topup.id,
          jsonb_build_object('provider', v_topup.provider, 'amount', v_topup.amount, 'payment_method', p_payment_method));

  insert into public.notifications(user_id, title, message, reference_type, reference_id)
  values (v_topup.user_id, 'Top Up Berhasil', 'Saldo ' || v_topup.amount || ' berhasil ditambahkan otomatis melalui FR3 NEWERA.', 'topup', v_topup.id);
end;
$$;

revoke all on function public.confirm_gateway_topup(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_gateway_topup(uuid,text,timestamptz) to service_role;

-- confirm_pakasir_topup (v34) SENGAJA dibiarkan ada di database (tidak di-drop)
-- supaya tidak ada downtime/error kalau masih ada request yang sedang berjalan
-- saat deploy. Kalau sudah yakin tidak dipakai lagi, boleh dihapus manual nanti:
--   drop function if exists public.confirm_pakasir_topup(uuid,text,timestamptz);
