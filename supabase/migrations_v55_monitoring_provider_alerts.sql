-- AIDIL STORE v55: Monitoring, Provider Status & Automatic Alerts
-- Additive operational telemetry. Secrets remain server-side.

create table if not exists public.provider_health_checks (
  id uuid primary key default extensions.uuid_generate_v4(),
  provider text not null,
  check_type text not null,
  status text not null check (status in ('UP','DEGRADED','DOWN','NOT_CONFIGURED')),
  latency_ms integer,
  message text,
  checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists provider_health_checks_provider_time_idx on public.provider_health_checks(provider, checked_at desc);
create index if not exists provider_health_checks_status_time_idx on public.provider_health_checks(status, checked_at desc);

alter table public.admin_role_permissions add column if not exists updated_at timestamptz;
insert into public.admin_role_permissions(role,permission,enabled) values
 ('ADMIN','monitoring.provider.view',true),
 ('SUPER_ADMIN','monitoring.provider.view',true)
on conflict (role,permission) do nothing;

alter table public.provider_health_checks enable row level security;
drop policy if exists provider_health_checks_admin_select on public.provider_health_checks;
create policy provider_health_checks_admin_select on public.provider_health_checks for select using (is_admin());
revoke all on public.provider_health_checks from public,anon,authenticated;
grant select on public.provider_health_checks to authenticated;
