create table if not exists public.ppob_provider_syncs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  kind text not null check (kind in ('prepaid','postpaid','all')),
  status text not null check (status in ('RUNNING','SUCCESS','FAILED')),
  fetched integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references auth.users(id)
);
create index if not exists ppob_provider_syncs_provider_started_idx on public.ppob_provider_syncs(provider, started_at desc);

alter table public.ppob_provider_syncs enable row level security;
drop policy if exists "ppob_provider_syncs_admin_select" on public.ppob_provider_syncs;
drop policy if exists "ppob_provider_syncs_admin_write" on public.ppob_provider_syncs;
create policy "ppob_provider_syncs_admin_select" on public.ppob_provider_syncs for select using (is_admin());
create policy "ppob_provider_syncs_admin_write" on public.ppob_provider_syncs for all using (is_admin()) with check (is_admin());
