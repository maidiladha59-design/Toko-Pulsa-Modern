-- AIDIL STORE v68 — Admin 2FA (email OTP) setelah login password berhasil
-- Dipakai oleh /api/auth/admin/send-otp dan /api/auth/admin/verify-otp.
-- Hanya boleh diakses lewat service role (server), tidak lewat client langsung.

create table if not exists public.admin_login_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  verified_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists admin_login_otps_user_id_idx on public.admin_login_otps(user_id, created_at desc);

alter table public.admin_login_otps enable row level security;
revoke all on public.admin_login_otps from anon, authenticated;
-- Sengaja tidak ada policy: hanya service role (dipakai lewat createAdminClient()) yang boleh baca/tulis.

-- Bersihkan OTP admin yang sudah kedaluwarsa (opsional, bisa dijadwalkan lewat cron/pg_cron).
create or replace function public.cleanup_expired_admin_login_otps()
returns void
language sql security definer set search_path=public
as $$
  delete from public.admin_login_otps where expires_at < now() - interval '1 day';
$$;

revoke all on function public.cleanup_expired_admin_login_otps() from public;
grant execute on function public.cleanup_expired_admin_login_otps() to service_role;
