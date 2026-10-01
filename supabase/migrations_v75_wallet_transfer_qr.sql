-- =========================================================
-- AIDIL STORE v75: TRANSFER SALDO ANTAR-USER + QR PRIBADI
-- =========================================================
-- Fitur:
--   1. Transfer saldo antar-user (wallet ledger, atomic, idempotent).
--   2. Pengaturan transfer yang dikelola admin: on/off, biaya admin,
--      nominal min/max, limit harian & bulanan.
--   3. Kontak favorit penerima transfer.
--   4. QR Pribadi: token acak 64 hex per user untuk menerima transfer.
--      QR hanya berisi token publik — tanpa email, saldo, atau data pribadi.
--
-- Keamanan:
--   - Saldo TIDAK PERNAH diubah langsung dari client: semua perubahan lewat
--     fungsi security definer + baris ledger di wallet_transactions.
--   - create_wallet_transfer idempotent via idempotency_key unik dan
--     mencatat aksi ke audit_logs ('transfer.sent').
--   - Tabel user_qr_tokens & transfer_contacts tanpa policy: akses hanya
--     lewat RPC security definer (pola sama seperti admin_login_otps v68).
--   - Wallet dikunci dengan urutan tetap agar bebas deadlock (A→B vs B→A).
--
-- Aman dijalankan ulang (idempotent).
-- =========================================================

-- =========================================================
-- 1) Nilai enum baru untuk transaksi wallet
-- =========================================================
alter type public.wallet_tx_type add value if not exists 'TRANSFER';

-- =========================================================
-- 2) Pengaturan transfer (singleton id = 1, diubah admin)
-- =========================================================
create table if not exists public.transfer_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  fee_type text not null default 'FIXED' check (fee_type in ('FIXED','PERCENTAGE')),
  fee_value numeric(12,4) not null default 0 check (fee_value >= 0),
  min_transfer bigint not null default 1000 check (min_transfer > 0),
  max_transfer bigint not null default 10000000 check (max_transfer >= min_transfer),
  daily_limit bigint not null default 25000000 check (daily_limit > 0),
  monthly_limit bigint not null default 500000000 check (monthly_limit > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.transfer_settings (id, enabled, fee_type, fee_value, min_transfer, max_transfer, daily_limit, monthly_limit)
values (1, true, 'FIXED', 0, 1000, 10000000, 25000000, 500000000)
on conflict (id) do nothing;

alter table public.transfer_settings enable row level security;
revoke all on public.transfer_settings from anon, authenticated;
grant select on public.transfer_settings to authenticated;

drop policy if exists "transfer_settings_admin_read" on public.transfer_settings;
create policy "transfer_settings_admin_read" on public.transfer_settings
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('ADMIN','SUPER_ADMIN'))
  );

-- =========================================================
-- 3) Resi transfer antar-user (ledger di wallet_transactions)
-- =========================================================
create table if not exists public.wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  total bigint not null check (total = amount + fee),
  note text check (note is null or char_length(note) <= 140),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  unique (sender_id, idempotency_key)
);

create index if not exists wallet_transfers_sender_created_idx
  on public.wallet_transfers (sender_id, created_at desc);
create index if not exists wallet_transfers_recipient_created_idx
  on public.wallet_transfers (recipient_id, created_at desc);

alter table public.wallet_transfers enable row level security;
revoke all on public.wallet_transfers from anon, authenticated;
grant select on public.wallet_transfers to authenticated;

drop policy if exists "wallet_transfers_select_own_or_admin" on public.wallet_transfers;
create policy "wallet_transfers_select_own_or_admin" on public.wallet_transfers
  for select using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());

-- =========================================================
-- 4) Kontak favorit transfer (akses hanya lewat RPC)
-- =========================================================
create table if not exists public.transfer_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid not null references public.profiles(id) on delete cascade,
  alias text check (alias is null or char_length(alias) <= 60),
  created_at timestamptz not null default now(),
  unique (user_id, contact_user_id),
  check (user_id <> contact_user_id)
);

alter table public.transfer_contacts enable row level security;
revoke all on public.transfer_contacts from anon, authenticated;
-- Sengaja TANPA policy: baca/tulis hanya lewat RPC security definer di bawah,
-- supaya validasi (bukan diri sendiri, penerima ada) selalu dijalankan.

-- =========================================================
-- 5) Token QR pribadi per user
-- =========================================================
create table if not exists public.user_qr_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) = 64),
  created_at timestamptz not null default now(),
  regenerated_at timestamptz
);

alter table public.user_qr_tokens enable row level security;
revoke all on public.user_qr_tokens from anon, authenticated;
-- Sengaja TANPA policy: token hanya dibaca/ditulis lewat RPC security definer
-- (pola sama seperti admin_login_otps v68). Client tidak pernah SELECT tabel ini.

-- =========================================================
-- 6) Generator token QR (64 hex, tidak mengandung data pribadi)
-- =========================================================
create or replace function public.generate_qr_token()
returns text
language sql volatile
security definer set search_path = public, extensions
as $$
  select substr(
    replace(extensions.uuid_generate_v4()::text, '-', '') ||
    replace(extensions.uuid_generate_v4()::text, '-', ''),
    1, 64
  );
$$;

revoke all on function public.generate_qr_token() from public, anon, authenticated;

-- =========================================================
-- 7) Ambil / buat token QR milik user yang login
-- =========================================================
create or replace function public.ensure_user_qr_token()
returns text
language plpgsql volatile
security definer set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select token into v_token from public.user_qr_tokens where user_id = auth.uid();
  if found then
    return v_token;
  end if;

  v_token := public.generate_qr_token();
  insert into public.user_qr_tokens (user_id, token)
  values (auth.uid(), v_token)
  on conflict (user_id) do nothing;

  select token into v_token from public.user_qr_tokens where user_id = auth.uid();
  return v_token;
end;
$$;

revoke all on function public.ensure_user_qr_token() from public, anon;
grant execute on function public.ensure_user_qr_token() to authenticated;

-- =========================================================
-- 8) Regenerate token QR (QR lama otomatis tidak berlaku)
-- =========================================================
create or replace function public.regenerate_user_qr_token()
returns text
language plpgsql volatile
security definer set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_token := public.generate_qr_token();
  insert into public.user_qr_tokens (user_id, token, regenerated_at)
  values (auth.uid(), v_token, now())
  on conflict (user_id) do update
    set token = excluded.token,
        regenerated_at = now();

  return v_token;
end;
$$;

revoke all on function public.regenerate_user_qr_token() from public, anon;
grant execute on function public.regenerate_user_qr_token() to authenticated;

-- =========================================================
-- 9) Resolve token QR menjadi profil publik penerima.
--    Hanya mengembalikan nama tampilan & avatar — TANPA email,
--    saldo, atau data pribadi lain.
-- =========================================================
create or replace function public.resolve_qr_token(p_token text)
returns table (recipient_id uuid, display_name text, avatar_url text)
language sql stable
security definer set search_path = public
as $$
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), 'Pengguna AIDIL STORE'),
         p.avatar_url
  from public.user_qr_tokens t
  join public.profiles p on p.id = t.user_id
  where p_token is not null
    and char_length(p_token) = 64
    and t.token = p_token;
$$;

revoke all on function public.resolve_qr_token(text) from public, anon;
grant execute on function public.resolve_qr_token(text) to authenticated;

-- =========================================================
-- 10) Pengaturan + pemakaian limit milik pemanggil
-- =========================================================
create or replace function public.get_transfer_settings()
returns table (
  enabled boolean,
  fee_type text,
  fee_value numeric,
  min_transfer bigint,
  max_transfer bigint,
  daily_limit bigint,
  monthly_limit bigint,
  used_today bigint,
  used_this_month bigint
)
language sql stable
security definer set search_path = public
as $$
  select s.enabled, s.fee_type, s.fee_value, s.min_transfer, s.max_transfer,
         s.daily_limit, s.monthly_limit,
         coalesce((
           select sum(t.total) from public.wallet_transfers t
           where t.sender_id = auth.uid()
             and t.created_at >= (date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')
         ), 0)::bigint,
         coalesce((
           select sum(t.total) from public.wallet_transfers t
           where t.sender_id = auth.uid()
             and t.created_at >= (date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta')
         ), 0)::bigint
  from public.transfer_settings s
  where s.id = 1;
$$;

revoke all on function public.get_transfer_settings() from public, anon;
grant execute on function public.get_transfer_settings() to authenticated;

-- =========================================================
-- 11) Kontak favorit: list / tambah / hapus
-- =========================================================
create or replace function public.list_transfer_contacts()
returns table (contact_user_id uuid, alias text, display_name text, avatar_url text, created_at timestamptz)
language sql stable
security definer set search_path = public
as $$
  select c.contact_user_id,
         c.alias,
         coalesce(nullif(btrim(p.full_name), ''), 'Pengguna AIDIL STORE'),
         p.avatar_url,
         c.created_at
  from public.transfer_contacts c
  join public.profiles p on p.id = c.contact_user_id
  where c.user_id = auth.uid()
  order by c.created_at desc;
$$;

revoke all on function public.list_transfer_contacts() from public, anon;
grant execute on function public.list_transfer_contacts() to authenticated;

create or replace function public.add_transfer_contact(p_contact_user_id uuid, p_alias text default null)
returns void
language plpgsql volatile
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_contact_user_id is null or p_contact_user_id = auth.uid() then
    raise exception 'INVALID_CONTACT';
  end if;

  if not exists (select 1 from public.profiles where id = p_contact_user_id) then
    raise exception 'CONTACT_NOT_FOUND';
  end if;

  insert into public.transfer_contacts (user_id, contact_user_id, alias)
  values (auth.uid(), p_contact_user_id, nullif(btrim(coalesce(p_alias, '')), ''))
  on conflict (user_id, contact_user_id) do update set alias = excluded.alias;
end;
$$;

revoke all on function public.add_transfer_contact(uuid, text) from public, anon;
grant execute on function public.add_transfer_contact(uuid, text) to authenticated;

create or replace function public.remove_transfer_contact(p_contact_user_id uuid)
returns void
language plpgsql volatile
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  delete from public.transfer_contacts
  where user_id = auth.uid() and contact_user_id = p_contact_user_id;
end;
$$;

revoke all on function public.remove_transfer_contact(uuid) from public, anon;
grant execute on function public.remove_transfer_contact(uuid) to authenticated;

-- =========================================================
-- 12) INTI: transfer saldo antar-user (atomic + idempotent)
-- =========================================================
-- - Kunci dua wallet dengan urutan tetap (bebas deadlock).
-- - Cek limit harian/bulanan dari total (nominal + biaya).
-- - Debit pengirim & kredit penerima lewat wallet_transactions.
-- - Biaya admin tercatat di resi (wallet_transfers.fee); tidak
--   dikreditkan ke wallet user mana pun.
-- - Aksi dicatat di audit_logs dengan aksi 'transfer.sent'.
create or replace function public.create_wallet_transfer(
  p_user_id uuid,
  p_recipient_id uuid,
  p_amount bigint,
  p_note text,
  p_idempotency_key text
)
returns uuid
language plpgsql volatile
security definer set search_path = public, extensions
as $$
declare
  v_sender_wallet wallets%rowtype;
  v_recipient_wallet wallets%rowtype;
  v_settings transfer_settings%rowtype;
  v_sender_name text;
  v_recipient_name text;
  v_fee bigint;
  v_total bigint;
  v_transfer_id uuid;
  v_transfer_number text;
  v_day_start timestamptz;
  v_month_start timestamptz;
  v_used_today bigint;
  v_used_month bigint;
begin
  -- SECURITY DEFINER tetap wajib memastikan transfer hanya untuk user yang login.
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_user_id <> auth.uid() then
    raise exception 'USER_ID_MISMATCH';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if p_recipient_id is null or p_recipient_id = p_user_id then
    raise exception 'SELF_TRANSFER';
  end if;

  -- Idempotency: key yang sama (milik pengirim yang sama) mengembalikan
  -- transfer yang sudah ada.
  select id into v_transfer_id from wallet_transfers
    where sender_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return v_transfer_id;
  end if;

  select * into v_settings from transfer_settings where id = 1;
  if not found or not v_settings.enabled then
    raise exception 'TRANSFER_DISABLED';
  end if;

  if p_amount < v_settings.min_transfer then
    raise exception 'BELOW_MIN_TRANSFER';
  end if;

  if p_amount > v_settings.max_transfer then
    raise exception 'ABOVE_MAX_TRANSFER';
  end if;

  if char_length(coalesce(p_note, '')) > 140 then
    raise exception 'INVALID_NOTE';
  end if;

  -- Penerima wajib ada (profil) sebelum saldo disentuh.
  select coalesce(nullif(btrim(full_name), ''), 'Pengguna AIDIL STORE') into v_recipient_name
    from profiles where id = p_recipient_id;
  if v_recipient_name is null then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'Pengguna AIDIL STORE') into v_sender_name
    from profiles where id = p_user_id;

  -- Biaya admin dibayar pengirim.
  if v_settings.fee_type = 'PERCENTAGE' then
    v_fee := ceil(p_amount * v_settings.fee_value / 100.0)::bigint;
  else
    v_fee := round(v_settings.fee_value)::bigint;
  end if;

  v_total := p_amount + v_fee;

  -- Kunci kedua wallet dengan urutan tetap untuk mencegah deadlock.
  if p_user_id::text < p_recipient_id::text then
    perform 1 from wallets where user_id = p_user_id for update;
    perform 1 from wallets where user_id = p_recipient_id for update;
  else
    perform 1 from wallets where user_id = p_recipient_id for update;
    perform 1 from wallets where user_id = p_user_id for update;
  end if;

  select * into v_sender_wallet from wallets where user_id = p_user_id;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  select * into v_recipient_wallet from wallets where user_id = p_recipient_id;
  if not found then
    raise exception 'RECIPIENT_WALLET_NOT_FOUND';
  end if;

  -- Limit harian & bulanan (zona waktu Asia/Jakarta), dihitung dari total.
  v_day_start := date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
  v_month_start := date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';

  select coalesce(sum(total), 0) into v_used_today
    from wallet_transfers
    where sender_id = p_user_id and created_at >= v_day_start;
  if v_used_today + v_total > v_settings.daily_limit then
    raise exception 'DAILY_LIMIT_EXCEEDED';
  end if;

  select coalesce(sum(total), 0) into v_used_month
    from wallet_transfers
    where sender_id = p_user_id and created_at >= v_month_start;
  if v_used_month + v_total > v_settings.monthly_limit then
    raise exception 'MONTHLY_LIMIT_EXCEEDED';
  end if;

  if v_sender_wallet.balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  v_transfer_number := 'TRF-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 8));

  begin
    insert into wallet_transfers (transfer_number, sender_id, recipient_id, amount, fee, total, note, idempotency_key)
    values (v_transfer_number, p_user_id, p_recipient_id, p_amount, v_fee, v_total,
            nullif(btrim(coalesce(p_note, '')), ''), p_idempotency_key)
    returning id into v_transfer_id;
  exception when unique_violation then
    -- Balapan request paralel dengan key yang sama: pakai transfer yang sudah dibuat.
    select id into v_transfer_id from wallet_transfers
      where sender_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return v_transfer_id;
    end if;
    raise;
  end;

  -- Debit pengirim (nominal + biaya admin).
  update wallets set balance = balance - v_total, updated_at = now() where id = v_sender_wallet.id;
  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_sender_wallet.id, 'TRANSFER', -v_total, v_sender_wallet.balance, v_sender_wallet.balance - v_total,
          'transfer', v_transfer_id, 'Transfer ke ' || v_recipient_name);

  -- Kredit penerima (nominal penuh, tanpa biaya admin).
  update wallets set balance = balance + p_amount, updated_at = now() where id = v_recipient_wallet.id;
  insert into wallet_transactions (wallet_id, type, amount, balance_before, balance_after, reference_type, reference_id, description)
  values (v_recipient_wallet.id, 'TRANSFER', p_amount, v_recipient_wallet.balance, v_recipient_wallet.balance + p_amount,
          'transfer', v_transfer_id, 'Transfer dari ' || v_sender_name);

  insert into audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_user_id, 'transfer.sent', 'wallet_transfer', v_transfer_id,
          jsonb_build_object(
            'recipient_id', p_recipient_id,
            'amount', p_amount,
            'fee', v_fee,
            'total', v_total,
            'transfer_number', v_transfer_number
          ));

  return v_transfer_id;
end;
$$;

revoke all on function public.create_wallet_transfer(uuid, uuid, bigint, text, text) from public, anon;
grant execute on function public.create_wallet_transfer(uuid, uuid, bigint, text, text) to authenticated;

-- =========================================================
-- 13) Template notifikasi transfer
-- =========================================================
insert into public.notification_templates (event_key, title, subtitle, message) values
('TRANSFER_SENT', 'Transfer Berhasil ✅', 'Saldo berhasil dikirim.', 'Transfer {{amount}} ke {{recipient}} berhasil. Referensi: {{reference}}.'),
('TRANSFER_RECEIVED', 'Saldo Masuk 💰', 'Kamu menerima transfer saldo.', 'Kamu menerima {{amount}} dari {{sender}}. Referensi: {{reference}}.')
on conflict (event_key) do nothing;

-- =========================================================
-- Selesai. Jalankan ulang migrasi ini dengan aman.
-- =========================================================
