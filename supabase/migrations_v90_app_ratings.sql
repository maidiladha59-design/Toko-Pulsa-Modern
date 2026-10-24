-- AIDIL STORE v90: rating / ulasan layanan.
-- Jalankan setelah v89.
--
--   1) Tabel app_ratings: satu rating per pengguna, RLS hanya untuk baris sendiri.
--   2) Kolom profiles.rating_prompted_at: pembatas agar modal rating tidak
--      muncul berulang saat pengguna menutupnya tanpa mengisi.
--   3) RPC hitung transaksi berhasil (orders COMPLETED), prompt, submit,
--      dismiss, ringkasan publik, daftar ulasan approved, dan moderasi admin.
--
-- Sumber hitungan transaksi HARUS sama dengan halaman Peringkat:
-- orders dengan status COMPLETED. Jangan memakai tabel/log lain.

-- =========================================================
-- 1) Tabel app_ratings
-- =========================================================
create table if not exists public.app_ratings (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  transaction_count_at_rating int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

-- Satu pengguna hanya boleh menilai sekali. RPC submit juga memeriksa ini
-- agar pesan yang diterima pengguna ramah, bukan error constraint mentah.
create unique index if not exists app_ratings_user_unique
  on public.app_ratings (user_id);

create index if not exists app_ratings_created_idx
  on public.app_ratings (created_at desc);

create index if not exists app_ratings_published_idx
  on public.app_ratings (created_at desc)
  where is_published = true;

alter table public.app_ratings enable row level security;

drop policy if exists "app_ratings_select_own" on public.app_ratings;
create policy "app_ratings_select_own" on public.app_ratings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "app_ratings_insert_own" on public.app_ratings;
create policy "app_ratings_insert_own" on public.app_ratings
  for insert to authenticated with check (user_id = auth.uid());

-- Tidak ada policy update/delete: moderasi hanya lewat RPC admin.
revoke all on public.app_ratings from public, anon, authenticated;
grant select on public.app_ratings to authenticated;
-- Kolom is_published sengaja tidak diberikan agar pengguna tidak bisa
-- mempublikasikan komentarnya sendiri tanpa persetujuan admin.
grant insert (user_id, rating, comment, transaction_count_at_rating)
  on public.app_ratings to authenticated;

comment on table public.app_ratings is
  'Rating 1-5 per pengguna; komentar tampil publik hanya setelah is_published = true.';

-- =========================================================
-- 2) Penanda prompt pada profiles
-- =========================================================
alter table public.profiles
  add column if not exists rating_prompted_at timestamptz;

-- =========================================================
-- 3) RPC hitungan transaksi berhasil
-- =========================================================
create or replace function public.get_my_transaction_count(p_user_id uuid)
returns int
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_user_id is null or (p_user_id <> auth.uid() and not public.is_admin_or_staff()) then
    raise exception 'RATING_FORBIDDEN';
  end if;

  select count(*)::int into v_count
    from public.orders
   where user_id = p_user_id and status = 'COMPLETED';

  return coalesce(v_count, 0);
end;
$$;

-- =========================================================
-- 4) RPC keputusan tampil/tidaknya modal
-- =========================================================
create or replace function public.should_prompt_rating(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_count int;
  v_prompted_at timestamptz;
  v_has_rating boolean;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'RATING_FORBIDDEN';
  end if;

  select count(*)::int into v_count
    from public.orders
   where user_id = p_user_id and status = 'COMPLETED';
  if coalesce(v_count, 0) < 10 then
    return false;
  end if;

  select exists (
    select 1 from public.app_ratings where user_id = p_user_id
  ) into v_has_rating;
  if v_has_rating then
    return false;
  end if;

  select rating_prompted_at into v_prompted_at
    from public.profiles where id = p_user_id;

  -- Jeda 3 hari memberi kesempatan lagi jika modal ditutup tanpa mengisi.
  if v_prompted_at is not null and v_prompted_at > now() - interval '3 days' then
    return false;
  end if;

  return true;
end;
$$;

-- =========================================================
-- 5) RPC submit rating
-- =========================================================
create or replace function public.submit_app_rating(
  p_user_id uuid,
  p_rating int,
  p_comment text default null
)
returns uuid
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_count int;
  v_comment text;
  v_rating_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'RATING_FORBIDDEN';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'RATING_INVALID';
  end if;
  if public.is_account_blocked(p_user_id) then
    raise exception 'ACCOUNT_BLOCKED';
  end if;

  v_comment := nullif(btrim(coalesce(p_comment, '')), '');
  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'COMMENT_TOO_LONG';
  end if;

  if exists (select 1 from public.app_ratings where user_id = p_user_id) then
    raise exception 'RATING_ALREADY_SUBMITTED';
  end if;

  select count(*)::int into v_count
    from public.orders
   where user_id = p_user_id and status = 'COMPLETED';
  if coalesce(v_count, 0) < 10 then
    raise exception 'RATING_NOT_ELIGIBLE';
  end if;

  insert into public.app_ratings (user_id, rating, comment, transaction_count_at_rating)
  values (p_user_id, p_rating, v_comment, v_count)
  returning id into v_rating_id;

  update public.profiles set rating_prompted_at = now() where id = p_user_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    p_user_id,
    'rating.submit',
    'app_rating',
    v_rating_id,
    jsonb_build_object(
      'rating', p_rating,
      'comment_present', v_comment is not null,
      'transaction_count_at_rating', v_count
    )
  );

  return v_rating_id;
exception
  when unique_violation then
    raise exception 'RATING_ALREADY_SUBMITTED';
end;
$$;

-- =========================================================
-- 6) RPC tandai sudah pernah diprompt
-- =========================================================
create or replace function public.mark_rating_prompted(p_user_id uuid)
returns void
language plpgsql
volatile
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'RATING_FORBIDDEN';
  end if;

  update public.profiles
     set rating_prompted_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
end;
$$;

-- =========================================================
-- 7) Agregat publik
-- =========================================================
-- Agregat menghitung semua rating (termasuk yang komentarnya belum
-- disetujui) supaya badge rata-rata langsung berubah setelah submit.
-- Moderasi hanya membatasi tampilnya komentar di daftar publik.
create or replace function public.get_rating_summary()
returns table(average numeric, total_count int)
language sql
stable
security definer set search_path = public
as $$
  select
    coalesce(round(avg(r.rating)::numeric, 2), 0::numeric) as average,
    count(*)::int as total_count
  from public.app_ratings r;
$$;

create or replace function public.get_published_ratings(p_limit int default 20)
returns table(display_name text, rating int, comment text, created_at timestamptz)
language sql
stable
security definer set search_path = public
as $$
  select
    coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'Pengguna AIDIL STORE') as display_name,
    r.rating,
    r.comment,
    r.created_at
  from public.app_ratings r
  left join public.profiles p on p.id = r.user_id
  where r.is_published = true
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- =========================================================
-- 8) Moderasi admin
-- =========================================================
create or replace function public.admin_set_rating_published(
  p_admin_id uuid,
  p_rating_id uuid,
  p_published boolean
)
returns void
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_role text;
  v_user_id uuid;
  v_rating int;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if p_admin_id is null or p_admin_id <> auth.uid() then
    raise exception 'ADMIN_MISMATCH';
  end if;

  select role into v_role from public.profiles where id = p_admin_id;
  if v_role is null or v_role not in ('SUPER_ADMIN', 'ADMIN', 'STAFF') then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_rating_id is null then
    raise exception 'RATING_NOT_FOUND';
  end if;

  update public.app_ratings
     set is_published = coalesce(p_published, false)
   where id = p_rating_id
  returning user_id, rating into v_user_id, v_rating;

  if not found then
    raise exception 'RATING_NOT_FOUND';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (
    p_admin_id,
    'rating.moderate',
    'app_rating',
    p_rating_id,
    jsonb_build_object(
      'published', coalesce(p_published, false),
      'user_id', v_user_id,
      'rating', v_rating
    )
  );
end;
$$;

-- =========================================================
-- 9) Hak eksekusi
-- =========================================================
revoke all on function public.get_my_transaction_count(uuid) from public, anon, authenticated;
revoke all on function public.should_prompt_rating(uuid) from public, anon, authenticated;
revoke all on function public.submit_app_rating(uuid, int, text) from public, anon, authenticated;
revoke all on function public.mark_rating_prompted(uuid) from public, anon, authenticated;
revoke all on function public.get_rating_summary() from public, anon, authenticated;
revoke all on function public.get_published_ratings(int) from public, anon, authenticated;
revoke all on function public.admin_set_rating_published(uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function public.get_my_transaction_count(uuid) to authenticated, service_role;
grant execute on function public.should_prompt_rating(uuid) to authenticated, service_role;
grant execute on function public.submit_app_rating(uuid, int, text) to authenticated, service_role;
grant execute on function public.mark_rating_prompted(uuid) to authenticated, service_role;
grant execute on function public.get_rating_summary() to anon, authenticated, service_role;
grant execute on function public.get_published_ratings(int) to anon, authenticated, service_role;
grant execute on function public.admin_set_rating_published(uuid, uuid, boolean) to authenticated, service_role;
