-- AIDIL STORE v48 — Maintenance Mode & System Control
-- Admin-controlled maintenance gate with optional schedule and admin bypass.

create table if not exists public.maintenance_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  title text not null default 'AIDIL STORE sedang dalam pemeliharaan',
  message text not null default 'Kami sedang melakukan perbaikan dan peningkatan sistem. Silakan coba kembali beberapa saat lagi.',
  starts_at timestamptz,
  ends_at timestamptz,
  allow_admin_bypass boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint maintenance_schedule_valid check (ends_at is null or starts_at is null or ends_at > starts_at)
);

insert into public.maintenance_settings (id) values (1) on conflict (id) do nothing;

alter table public.maintenance_settings enable row level security;

drop policy if exists "maintenance_public_read" on public.maintenance_settings;
create policy "maintenance_public_read" on public.maintenance_settings
  for select to anon, authenticated using (id = 1);

drop policy if exists "maintenance_admin_all" on public.maintenance_settings;
create policy "maintenance_admin_all" on public.maintenance_settings
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role::text in ('ADMIN','SUPER_ADMIN')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role::text in ('ADMIN','SUPER_ADMIN')
    )
  );

create index if not exists maintenance_settings_enabled_idx
  on public.maintenance_settings(enabled, starts_at, ends_at);

revoke all on public.maintenance_settings from anon, authenticated;
grant select on public.maintenance_settings to anon, authenticated;
grant insert, update, delete on public.maintenance_settings to authenticated;

comment on table public.maintenance_settings is 'Single-row admin-controlled maintenance gate for AIDIL STORE.';
