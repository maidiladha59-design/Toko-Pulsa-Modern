-- =========================================================
-- AIDIL STORE v76: SPLIT BILL (TAGIHAN PATUNGAN)
-- =========================================================
-- Fitur:
--   1. Mekanisme "Minta Saldo" inti: tabel payment_requests
--      (permintaan bayar dari requester ke payer). Split bill
--      memakai mekanisme ini — tidak ada jalur permintaan kedua.
--   2. Tagihan patungan: judul + total nominal + peserta
--      (dari kontak favorit / email), dibagi rata atau nominal
--      custom per orang. Jumlah bagian semua peserta = total.
--   3. Setiap peserta otomatis menerima payment_requests ke
--      pembuat tagihan (requester = pembuat, payer = peserta).
--   4. Pembayaran peserta tetap lewat create_wallet_transfer
--      (v75): PIN transaksi, biaya admin, limit harian/bulanan,
--      wallet ledger, idempotency — TIDAK ADA jalur uang baru.
--   5. Tagihan otomatis COMPLETED saat semua peserta sudah
--      membayar (dicek atomik di transaksi yang sama).
--   6. Pengingat dari pembuat ke peserta yang belum bayar,
--      dibatasi maksimal 1x per jam per peserta.
--
-- Arsitektur status:
--   - Status pembayaran peserta HIDUP di payment_requests.status
--     (satu sumber kebenaran); split_bill_participants hanya
--     menyimpan bagian + tautan permintaannya.
--
-- Aritmetika:
--   - Semua nominal bigint (rupiah), tanpa float.
--   - Bagi rata: base = total / jumlah_peserta (pembagian bulat),
--     sisa = total - base * jumlah_peserta. Sisa dibebankan ke
--     PESERTA PERTAMA (urutan daftar saat membuat tagihan) dan
--     dijelaskan di UI.
--
-- Keamanan:
--   - Semua tabel baru: RLS aktif, revoke dari anon/authenticated,
--     tulis hanya lewat RPC security definer.
--   - Peserta hanya bisa melihat tagihan yang melibatkan mereka
--     (policy + validasi ulang di RPC).
--   - audit_logs: splitbill.created / splitbill.paid /
--     splitbill.completed / splitbill.reminder (+ transfer.sent
--     otomatis dari create_wallet_transfer).
--   - pay_split_bill_share memanggil create_wallet_transfer di
--     DALAM transaksinya: transfer + penandaan lunas + status
--     tagihan terjadi atomik (semua atau tidak sama sekali).
--   - Baris tagihan & permintaan dikunci (FOR UPDATE) lebih dulu
--     supaya dua pembayaran paralel tidak lolos bersamaan dan
--     penyelesaian tagihan tidak terlewat.
--
-- Aman dijalankan ulang (idempotent).
-- =========================================================

-- =========================================================
-- 1) Minta Saldo: permintaan bayar antar-user (inti bersama)
-- =========================================================
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  payer_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount > 0),
  note text check (note is null or char_length(note) <= 140),
  status text not null default 'PENDING' check (status in ('PENDING','PAID')),
  reference_type text,
  reference_id uuid,
  paid_transfer_id uuid references public.wallet_transfers(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (requester_id <> payer_id)
);

create index if not exists payment_requests_payer_created_idx
  on public.payment_requests (payer_id, created_at desc);
create index if not exists payment_requests_requester_created_idx
  on public.payment_requests (requester_id, created_at desc);
-- Satu permintaan per peserta per tagihan (mencegah double request).
create unique index if not exists payment_requests_split_bill_unique
  on public.payment_requests (reference_id, payer_id)
  where reference_type = 'SPLIT_BILL';

alter table public.payment_requests enable row level security;
revoke all on public.payment_requests from anon, authenticated;
grant select on public.payment_requests to authenticated;

drop policy if exists "payment_requests_select_involved_or_admin" on public.payment_requests;
create policy "payment_requests_select_involved_or_admin" on public.payment_requests
  for select using (
    requester_id = auth.uid() or payer_id = auth.uid() or public.is_admin()
  );

-- =========================================================
-- 2) Tagihan patungan
-- =========================================================
create table if not exists public.split_bills (
  id uuid primary key default gen_random_uuid(),
  bill_number text not null unique,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  total_amount bigint not null check (total_amount > 0),
  split_mode text not null default 'EQUAL' check (split_mode in ('EQUAL','CUSTOM')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists split_bills_creator_created_idx
  on public.split_bills (creator_id, created_at desc);

alter table public.split_bills enable row level security;
revoke all on public.split_bills from anon, authenticated;
grant select on public.split_bills to authenticated;

-- =========================================================
-- 3) Peserta tagihan (bagian + tautan permintaan bayar)
-- =========================================================
create table if not exists public.split_bill_participants (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.split_bills(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_amount bigint not null check (share_amount > 0),
  payment_request_id uuid not null unique references public.payment_requests(id),
  order_index integer not null default 0,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bill_id, user_id)
);

create index if not exists split_bill_participants_user_idx
  on public.split_bill_participants (user_id);

alter table public.split_bill_participants enable row level security;
revoke all on public.split_bill_participants from anon, authenticated;
grant select on public.split_bill_participants to authenticated;

drop policy if exists "split_bill_participants_select_involved_or_admin" on public.split_bill_participants;
create policy "split_bill_participants_select_involved_or_admin" on public.split_bill_participants
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.split_bills b
      where b.id = split_bill_participants.bill_id and b.creator_id = auth.uid()
    )
    or public.is_admin()
  );

-- Peserta hanya melihat tagihan yang melibatkan mereka; pembuat
-- melihat tagihannya sendiri; admin boleh mengawasi.
-- (Dipindah ke sini — setelah tabel split_bill_participants ada —
-- karena policy di bawah ini mereferensikan tabel tersebut.)
drop policy if exists "split_bills_select_involved_or_admin" on public.split_bills;
create policy "split_bills_select_involved_or_admin" on public.split_bills
  for select using (
    creator_id = auth.uid()
    or exists (
      select 1 from public.split_bill_participants p
      where p.bill_id = split_bills.id and p.user_id = auth.uid()
    )
    or public.is_admin()
  );

-- =========================================================
-- 4) Buat tagihan patungan + permintaan bayar per peserta
-- =========================================================
-- p_participants: array JSONB [{ "user_id": uuid, "share_amount": bigint }]
--   - EQUAL  : share_amount diabaikan, dihitung server (urutan array =
--              urutan peserta; sisa pembagian ke peserta pertama).
--   - CUSTOM : share_amount wajib > 0 dan jumlahnya = p_total_amount.
create or replace function public.create_split_bill(
  p_title text,
  p_total_amount bigint,
  p_mode text,
  p_participants jsonb
)
returns uuid
language plpgsql volatile
security definer set search_path = public, extensions
as $$
declare
  v_count integer;
  v_i integer;
  v_base bigint;
  v_remainder bigint;
  v_share bigint;
  v_bill_id uuid;
  v_bill_number text;
  v_request_id uuid;
  v_entry jsonb;
  v_user_id uuid;
  v_user_text text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_title is null or char_length(btrim(p_title)) < 3 or char_length(btrim(p_title)) > 100 then
    raise exception 'INVALID_TITLE';
  end if;

  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  if p_mode is null or p_mode not in ('EQUAL', 'CUSTOM') then
    raise exception 'INVALID_MODE';
  end if;

  if p_participants is null or jsonb_typeof(p_participants) <> 'array' then
    raise exception 'INVALID_PARTICIPANTS';
  end if;

  v_count := jsonb_array_length(p_participants);
  if v_count < 1 or v_count > 20 then
    raise exception 'INVALID_PARTICIPANTS';
  end if;

  -- Validasi tiap peserta: format uuid, bukan pembuat, akunnya ada,
  -- dan (mode CUSTOM) nominal bagian berupa integer positif.
  for v_i in 0..v_count - 1 loop
    v_entry := p_participants -> v_i;
    v_user_text := v_entry ->> 'user_id';
    if v_user_text is null or v_user_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'INVALID_PARTICIPANTS';
    end if;
    v_user_id := v_user_text::uuid;
    if v_user_id = auth.uid() then
      raise exception 'SELF_PARTICIPANT';
    end if;
    if not exists (select 1 from public.profiles where id = v_user_id) then
      raise exception 'PARTICIPANT_NOT_FOUND';
    end if;
    if p_mode = 'CUSTOM' then
      if (v_entry ->> 'share_amount') is null or (v_entry ->> 'share_amount') !~ '^\d+$' then
        raise exception 'INVALID_SHARE';
      end if;
      if (v_entry ->> 'share_amount')::bigint <= 0 then
        raise exception 'INVALID_SHARE';
      end if;
    end if;
  end loop;

  if (select count(distinct x ->> 'user_id') from jsonb_array_elements(p_participants) x) <> v_count then
    raise exception 'DUPLICATE_PARTICIPANT';
  end if;

  if p_mode = 'CUSTOM' then
    if (select coalesce(sum((x ->> 'share_amount')::bigint), 0) from jsonb_array_elements(p_participants) x) <> p_total_amount then
      raise exception 'SHARES_MISMATCH';
    end if;
  end if;

  v_bill_number := 'SPL-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 8));

  insert into public.split_bills (bill_number, creator_id, title, total_amount, split_mode)
  values (v_bill_number, auth.uid(), btrim(p_title), p_total_amount, p_mode)
  returning id into v_bill_id;

  -- Bagi rata dengan integer murni: sisa ke peserta pertama.
  if p_mode = 'EQUAL' then
    v_base := p_total_amount / v_count;
    v_remainder := p_total_amount - v_base * v_count;
  end if;

  for v_i in 0..v_count - 1 loop
    v_entry := p_participants -> v_i;
    v_user_id := (v_entry ->> 'user_id')::uuid;

    if p_mode = 'EQUAL' then
      v_share := v_base + (case when v_i = 0 then v_remainder else 0 end);
    else
      v_share := (v_entry ->> 'share_amount')::bigint;
    end if;

    -- Minta Saldo: satu permintaan bayar ke pembuat per peserta.
    insert into public.payment_requests (request_number, requester_id, payer_id, amount, note, reference_type, reference_id)
    values (
      'REQ-' || to_char(now(), 'YYYYMMDD') || '-' ||
        upper(substr(replace(extensions.uuid_generate_v4()::text, '-', ''), 1, 8)),
      auth.uid(),
      v_user_id,
      v_share,
      'Split bill: ' || btrim(p_title),
      'SPLIT_BILL',
      v_bill_id
    )
    returning id into v_request_id;

    insert into public.split_bill_participants (bill_id, user_id, share_amount, payment_request_id, order_index)
    values (v_bill_id, v_user_id, v_share, v_request_id, v_i);
  end loop;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'splitbill.created', 'split_bill', v_bill_id,
          jsonb_build_object(
            'bill_number', v_bill_number,
            'title', btrim(p_title),
            'total_amount', p_total_amount,
            'split_mode', p_mode,
            'participant_count', v_count
          ));

  return v_bill_id;
end;
$$;

revoke all on function public.create_split_bill(text, bigint, text, jsonb) from public, anon;
grant execute on function public.create_split_bill(text, bigint, text, jsonb) to authenticated;

-- =========================================================
-- 5) Daftar tagihan saya (dibuat atau saya ikut)
-- =========================================================
create or replace function public.get_my_split_bills()
returns table (
  id uuid,
  bill_number text,
  title text,
  total_amount bigint,
  split_mode text,
  status text,
  is_creator boolean,
  created_at timestamptz,
  completed_at timestamptz,
  participant_count integer,
  paid_count integer,
  collected_amount bigint
)
language sql stable
security definer set search_path = public
as $$
  select b.id, b.bill_number, b.title, b.total_amount, b.split_mode, b.status,
         (b.creator_id = auth.uid()) as is_creator,
         b.created_at, b.completed_at,
         (select count(*)::integer from public.split_bill_participants p where p.bill_id = b.id),
         (select count(*)::integer
            from public.split_bill_participants p
            join public.payment_requests r on r.id = p.payment_request_id
           where p.bill_id = b.id and r.status = 'PAID'),
         (select coalesce(sum(r.amount), 0)::bigint
            from public.split_bill_participants p
            join public.payment_requests r on r.id = p.payment_request_id
           where p.bill_id = b.id and r.status = 'PAID')
  from public.split_bills b
  where b.creator_id = auth.uid()
     or exists (select 1 from public.split_bill_participants p
                where p.bill_id = b.id and p.user_id = auth.uid())
  order by b.created_at desc
  limit 50;
$$;

revoke all on function public.get_my_split_bills() from public, anon;
grant execute on function public.get_my_split_bills() to authenticated;

-- =========================================================
-- 6) Detail tagihan (pembuat / peserta / admin saja)
-- =========================================================
create or replace function public.get_split_bill(p_bill_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_bill split_bills%rowtype;
  v_is_creator boolean;
  v_is_admin boolean;
  v_creator_name text;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into v_bill from public.split_bills where id = p_bill_id;
  if not found then
    raise exception 'BILL_NOT_FOUND';
  end if;

  v_is_creator := v_bill.creator_id = auth.uid();
  v_is_admin := public.is_admin();
  if not v_is_creator and not v_is_admin and not exists (
    select 1 from public.split_bill_participants where bill_id = p_bill_id and user_id = auth.uid()
  ) then
    -- Jangan bocarkan keberadaan tagihan ke orang luar.
    raise exception 'BILL_NOT_FOUND';
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'Pengguna AIDIL STORE')
    into v_creator_name from public.profiles where id = v_bill.creator_id;

  return jsonb_build_object(
    'bill', jsonb_build_object(
      'id', v_bill.id,
      'bill_number', v_bill.bill_number,
      'title', v_bill.title,
      'total_amount', v_bill.total_amount,
      'split_mode', v_bill.split_mode,
      'status', v_bill.status,
      'created_at', v_bill.created_at,
      'completed_at', v_bill.completed_at,
      'creator_id', v_bill.creator_id,
      'creator_name', v_creator_name,
      'is_creator', v_is_creator
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.user_id,
               'display_name', coalesce(nullif(btrim(pr.full_name), ''), 'Pengguna AIDIL STORE'),
               'avatar_url', pr.avatar_url,
               'share_amount', p.share_amount,
               'status', r.status,
               'paid_at', r.paid_at,
               'request_number', r.request_number,
               'last_reminded_at', p.last_reminded_at,
               'is_viewer', p.user_id = auth.uid()
             ) order by p.order_index)
      from public.split_bill_participants p
      join public.payment_requests r on r.id = p.payment_request_id
      join public.profiles pr on pr.id = p.user_id
      where p.bill_id = p_bill_id
    ), '[]'::jsonb),
    'my_share', (
      select jsonb_build_object('share_amount', p.share_amount, 'status', r.status, 'request_number', r.request_number)
      from public.split_bill_participants p
      join public.payment_requests r on r.id = p.payment_request_id
      where p.bill_id = p_bill_id and p.user_id = auth.uid()
    ),
    'participant_count', (select count(*)::integer from public.split_bill_participants p where p.bill_id = p_bill_id),
    'paid_count', (select count(*)::integer
                     from public.split_bill_participants p
                     join public.payment_requests r on r.id = p.payment_request_id
                    where p.bill_id = p_bill_id and r.status = 'PAID'),
    'collected_amount', (select coalesce(sum(r.amount), 0)::bigint
                           from public.split_bill_participants p
                           join public.payment_requests r on r.id = p.payment_request_id
                          where p.bill_id = p_bill_id and r.status = 'PAID')
  );
end;
$$;

revoke all on function public.get_split_bill(uuid) from public, anon;
grant execute on function public.get_split_bill(uuid) to authenticated;

-- =========================================================
-- 7) INTI: bayar bagian saya — lewat create_wallet_transfer (v75)
-- =========================================================
-- Satu transaksi atomik: kunci tagihan + permintaan, transfer saldo
-- (PIN/biaya/limit/ledger/idempotency tetap di create_wallet_transfer),
-- tandai permintaan PAID, lalu selesaikan tagihan bila semua lunas.
create or replace function public.pay_split_bill_share(
  p_bill_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql volatile
security definer set search_path = public, extensions
as $$
declare
  v_bill split_bills%rowtype;
  v_participant split_bill_participants%rowtype;
  v_request payment_requests%rowtype;
  v_transfer_id uuid;
  v_transfer_number text;
  v_transfer_fee bigint;
  v_transfer_total bigint;
  v_creator_name text;
  v_completed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- Kunci tagihan lebih dulu: pembayaran paralel atas tagihan yang sama
  -- menjadi berurutan sehingga penyelesaian tagihan tidak terlewat.
  select * into v_bill from public.split_bills where id = p_bill_id for update;
  if not found then
    raise exception 'BILL_NOT_FOUND';
  end if;

  if v_bill.creator_id = auth.uid() then
    raise exception 'NOT_PARTICIPANT';
  end if;

  if not exists (select 1 from public.split_bill_participants
                 where bill_id = p_bill_id and user_id = auth.uid()) then
    raise exception 'BILL_NOT_FOUND';
  end if;

  if v_bill.status <> 'ACTIVE' then
    raise exception 'BILL_NOT_ACTIVE';
  end if;

  select * into v_participant
    from public.split_bill_participants
   where bill_id = p_bill_id and user_id = auth.uid();
  if not found then
    raise exception 'NOT_PARTICIPANT';
  end if;

  -- Kunci permintaan bayar: dua pembayaran paralel untuk peserta yang
  -- sama tidak boleh sama-sama lolos.
  select * into v_request from public.payment_requests where id = v_participant.payment_request_id for update;
  if v_request.status = 'PAID' then
    raise exception 'ALREADY_PAID';
  end if;

  -- Idempotency: key yang sudah dipakai transfer lain ditolak; key dari
  -- percobaan bayar tagihan ini yang sama (retry jaringan) diputar ulang
  -- tanpa memindahkan saldo dua kali.
  select id into v_transfer_id from public.wallet_transfers
   where sender_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then
    if not exists (select 1 from public.wallet_transfers
                    where id = v_transfer_id
                      and recipient_id = v_bill.creator_id
                      and amount = v_participant.share_amount) then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    -- Retry transfer yang sama persis: lanjut ke penandaan lunas.
  else
    -- Jalur uang SATU-SATUNYA: RPC transfer v75 (ledger + audit + limit).
    v_transfer_id := public.create_wallet_transfer(
      auth.uid(),
      v_bill.creator_id,
      v_participant.share_amount,
      'Split bill: ' || v_bill.title,
      p_idempotency_key
    );
  end if;

  select transfer_number, fee, total into v_transfer_number, v_transfer_fee, v_transfer_total
    from public.wallet_transfers where id = v_transfer_id;

  update public.payment_requests
     set status = 'PAID',
         paid_transfer_id = v_transfer_id,
         paid_at = now()
   where id = v_request.id and status = 'PENDING';

  select coalesce(nullif(btrim(full_name), ''), 'Pengguna AIDIL STORE')
    into v_creator_name from public.profiles where id = v_bill.creator_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'splitbill.paid', 'split_bill', p_bill_id,
          jsonb_build_object(
            'bill_number', v_bill.bill_number,
            'participant_id', v_participant.user_id,
            'share_amount', v_participant.share_amount,
            'transfer_id', v_transfer_id
          ));

  -- Tagihan otomatis SELESAI saat semua peserta sudah bayar.
  update public.split_bills
     set status = 'COMPLETED', completed_at = now()
   where id = p_bill_id and status = 'ACTIVE'
     and not exists (
       select 1 from public.split_bill_participants p
         join public.payment_requests r on r.id = p.payment_request_id
        where p.bill_id = p_bill_id and r.status <> 'PAID'
     );
  if found then
    v_completed := true;
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'splitbill.completed', 'split_bill', p_bill_id,
            jsonb_build_object(
              'bill_number', v_bill.bill_number,
              'total_amount', v_bill.total_amount
            ));
  end if;

  return jsonb_build_object(
    'transfer_id', v_transfer_id,
    'transfer_number', v_transfer_number,
    'amount', v_participant.share_amount,
    'fee', v_transfer_fee,
    'total', v_transfer_total,
    'bill_status', case when v_completed then 'COMPLETED' else v_bill.status end,
    'completed', v_completed,
    'creator_id', v_bill.creator_id,
    'creator_name', v_creator_name,
    'bill_title', v_bill.title,
    'bill_total_amount', v_bill.total_amount
  );
end;
$$;

revoke all on function public.pay_split_bill_share(uuid, text) from public, anon;
grant execute on function public.pay_split_bill_share(uuid, text) to authenticated;

-- =========================================================
-- 8) Kirim pengingat ke peserta yang belum bayar (maks 1x/jam)
-- =========================================================
create or replace function public.send_split_bill_reminder(
  p_bill_id uuid,
  p_participant_user_id uuid
)
returns jsonb
language plpgsql volatile
security definer set search_path = public
as $$
declare
  v_bill split_bills%rowtype;
  v_share bigint;
  v_last_reminded timestamptz;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into v_bill from public.split_bills where id = p_bill_id;
  if not found or v_bill.creator_id <> auth.uid() then
    raise exception 'BILL_NOT_FOUND';
  end if;

  if v_bill.status <> 'ACTIVE' then
    raise exception 'BILL_NOT_ACTIVE';
  end if;

  -- Kunci baris peserta supaya dua pengingat paralel tetap terhitung satu.
  perform 1 from public.split_bill_participants
    where bill_id = p_bill_id and user_id = p_participant_user_id for update;

  select p.share_amount, p.last_reminded_at into v_share, v_last_reminded
    from public.split_bill_participants p
    join public.payment_requests r on r.id = p.payment_request_id
   where p.bill_id = p_bill_id and p.user_id = p_participant_user_id
     and r.status = 'PENDING';
  if not found then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  if v_last_reminded is not null and now() - v_last_reminded < interval '1 hour' then
    raise exception 'REMINDER_TOO_FREQUENT';
  end if;

  update public.split_bill_participants
     set last_reminded_at = now()
   where bill_id = p_bill_id and user_id = p_participant_user_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'splitbill.reminder', 'split_bill', p_bill_id,
          jsonb_build_object(
            'bill_number', v_bill.bill_number,
            'participant_id', p_participant_user_id
          ));

  return jsonb_build_object('share_amount', v_share, 'title', v_bill.title);
end;
$$;

revoke all on function public.send_split_bill_reminder(uuid, uuid) from public, anon;
grant execute on function public.send_split_bill_reminder(uuid, uuid) to authenticated;

-- =========================================================
-- 9) Template notifikasi split bill
-- =========================================================
insert into public.notification_templates (event_key, title, subtitle, message) values
('SPLITBILL_INVITED', 'Tagihan Patungan 🧾', 'Kamu mendapat permintaan bayar.', '{{creator}} mengajakmu patungan "{{title}}". Bagian kamu {{amount}}. Buka tagihan untuk membayar.'),
('SPLITBILL_REMINDER', 'Pengingat Tagihan ⏰', 'Tagihan patungan belum dibayar.', 'Pengingat dari {{creator}}: bagian kamu {{amount}} pada tagihan "{{title}}" belum dibayar.'),
('SPLITBILL_COMPLETED', 'Tagihan Lunas ✅', 'Semua peserta sudah membayar.', 'Tagihan patungan "{{title}}" selesai. Total terkumpul {{amount}}.')
on conflict (event_key) do nothing;

-- =========================================================
-- Selesai. Jalankan ulang migrasi ini dengan aman.
-- =========================================================