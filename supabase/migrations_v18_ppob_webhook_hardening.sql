-- AIDIL STORE v18: webhook replay protection and audit trail.
-- Run after v16 migrations.

create table if not exists public.ppob_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'digiflazz',
  event_key text not null,
  ref_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'RECEIVED' check (status in ('RECEIVED','PROCESSED','IGNORED','ERROR')),
  error_message text
);

create unique index if not exists ppob_webhook_events_provider_key_idx
  on public.ppob_webhook_events(provider, event_key);
create index if not exists ppob_webhook_events_ref_idx
  on public.ppob_webhook_events(provider, ref_id, received_at desc);

alter table public.ppob_webhook_events enable row level security;
revoke all on public.ppob_webhook_events from public, anon, authenticated;
grant select, insert, update on public.ppob_webhook_events to service_role;
