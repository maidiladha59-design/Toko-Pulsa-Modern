-- AIDIL STORE v59
-- Onboarding persistence, 7-day inactivity re-login, and admin-configurable top-up deadline.

alter table public.profiles
  add column if not exists last_activity_at timestamptz;

create index if not exists profiles_last_activity_idx
  on public.profiles(last_activity_at);

alter table public.topup_fee_settings
  add column if not exists deadline_minutes integer not null default 10;

alter table public.topup_fee_settings
  drop constraint if exists topup_fee_settings_deadline_minutes_chk;

alter table public.topup_fee_settings
  add constraint topup_fee_settings_deadline_minutes_chk
  check (deadline_minutes between 5 and 1440);

update public.topup_fee_settings
set deadline_minutes = coalesce(deadline_minutes, 10)
where id = 1;

-- Public onboarding itself uses the existing home_banners table.
-- Admin editing is already protected by the existing admin API.
