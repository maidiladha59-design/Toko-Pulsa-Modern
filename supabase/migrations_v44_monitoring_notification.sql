-- AIDIL STORE v44: Monitoring & Notification Center
-- Additive monitoring state + alert deduplication. External provider calls remain server-side.

alter table public.admin_role_permissions add column if not exists updated_at timestamptz;
insert into public.admin_role_permissions(role,permission,enabled)
values
 ('ADMIN','monitoring.view',true),
 ('ADMIN','monitoring.manage',false),
 ('SUPER_ADMIN','monitoring.view',true),
 ('SUPER_ADMIN','monitoring.manage',true)
on conflict (role,permission) do nothing;

create table if not exists public.monitoring_alerts (
  id uuid primary key default extensions.uuid_generate_v4(),
  fingerprint text not null unique,
  severity text not null check (severity in ('INFO','WARNING','CRITICAL')),
  category text not null check (category in ('PAYMENT','WALLET','PPOB','REFUND','RECONCILIATION','WEBHOOK','PROVIDER','SYSTEM')),
  title text not null,
  message text not null,
  source text not null,
  entity_type text,
  entity_id uuid,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists monitoring_alerts_status_idx on public.monitoring_alerts(status,severity,last_seen_at desc);
create index if not exists monitoring_alerts_category_idx on public.monitoring_alerts(category,last_seen_at desc);

create table if not exists public.monitoring_runs (
  id uuid primary key default extensions.uuid_generate_v4(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING','SUCCESS','FAILED')),
  alerts_opened integer not null default 0,
  checks integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists monitoring_runs_started_idx on public.monitoring_runs(started_at desc);

alter table public.monitoring_alerts enable row level security;
alter table public.monitoring_runs enable row level security;
drop policy if exists monitoring_alerts_admin_select on public.monitoring_alerts;
drop policy if exists monitoring_runs_admin_select on public.monitoring_runs;
create policy monitoring_alerts_admin_select on public.monitoring_alerts for select using (is_admin());
create policy monitoring_runs_admin_select on public.monitoring_runs for select using (is_admin());
revoke all on public.monitoring_alerts from public,anon,authenticated;
revoke all on public.monitoring_runs from public,anon,authenticated;
grant select on public.monitoring_alerts, public.monitoring_runs to authenticated;

create or replace function public.upsert_monitoring_alert(
  p_fingerprint text,p_severity text,p_category text,p_title text,p_message text,p_source text,
  p_entity_type text default null,p_entity_id uuid default null,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_id uuid;
begin
  insert into public.monitoring_alerts(fingerprint,severity,category,title,message,source,entity_type,entity_id,metadata,last_seen_at,status,resolved_at,updated_at)
  values(p_fingerprint,p_severity,p_category,p_title,p_message,p_source,p_entity_type,p_entity_id,coalesce(p_metadata,'{}'::jsonb),now(),'OPEN',null,now())
  on conflict(fingerprint) do update set severity=excluded.severity,category=excluded.category,title=excluded.title,message=excluded.message,source=excluded.source,entity_type=excluded.entity_type,entity_id=excluded.entity_id,metadata=excluded.metadata,last_seen_at=now(),status=case when monitoring_alerts.status='RESOLVED' then 'OPEN' else monitoring_alerts.status end,resolved_at=case when monitoring_alerts.status='RESOLVED' then null else monitoring_alerts.resolved_at end,updated_at=now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.resolve_monitoring_alert(p_id uuid)
returns void language plpgsql security definer set search_path=public,extensions as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.monitoring_alerts set status='RESOLVED',resolved_at=now(),updated_at=now() where id=p_id;
end $$;

grant execute on function public.upsert_monitoring_alert(text,text,text,text,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.resolve_monitoring_alert(uuid) to authenticated;
