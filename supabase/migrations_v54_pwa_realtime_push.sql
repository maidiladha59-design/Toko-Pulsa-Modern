-- AIDIL STORE v54: PWA, Realtime & Push Notification subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions for select using (auth.uid()=user_id);
create policy push_subscriptions_own_insert on public.push_subscriptions for insert with check (auth.uid()=user_id);
create policy push_subscriptions_own_delete on public.push_subscriptions for delete using (auth.uid()=user_id);
revoke all on public.push_subscriptions from anon;
grant select,insert,delete on public.push_subscriptions to authenticated;

-- Keep notification delivery compatible with Supabase Realtime.
alter table public.notifications replica identity full;


do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  end if;
end $$;
