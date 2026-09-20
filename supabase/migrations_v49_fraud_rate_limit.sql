-- AIDIL STORE v49 — Fraud/Risk Detection + DB-backed Rate Limiting
-- Run after v48. No automatic account blocking: risk signals create REVIEW/HIGH_RISK only.

create table if not exists public.security_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.security_risk_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  risk_points integer not null default 0 check (risk_points >= 0),
  reason text not null,
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);


create table if not exists public.security_user_fingerprints (
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(user_id, fingerprint_hash)
);

alter table public.security_user_fingerprints enable row level security;
revoke all on public.security_user_fingerprints from anon, authenticated;

create or replace function public.observe_security_fingerprint(
  p_user_id uuid, p_fingerprint_hash text
)
returns integer
language plpgsql security definer set search_path=public,extensions
as $$
declare v_count integer; v_new boolean := false;
begin
  if p_user_id is null or p_fingerprint_hash is null then return 0; end if;
  insert into public.security_user_fingerprints(user_id,fingerprint_hash) values(p_user_id,p_fingerprint_hash)
  on conflict(user_id,fingerprint_hash) do update set last_seen_at=now();
  select count(*) into v_count from public.security_user_fingerprints where user_id=p_user_id;
  if v_count > 1 and not exists(select 1 from public.security_risk_events e where e.user_id=p_user_id and e.event_type='NEW_DEVICE_OR_IP' and e.metadata->>'fingerprint_hash'=p_fingerprint_hash and e.created_at > now()-interval '24 hours') then
    insert into public.security_risk_events(user_id,event_type,risk_points,reason,metadata) values(p_user_id,'NEW_DEVICE_OR_IP',15,'Perubahan perangkat/IP terdeteksi.',jsonb_build_object('fingerprint_hash',p_fingerprint_hash));
    update public.security_risk_profiles set risk_score=least(100,risk_score+15), status=case when status='BLOCKED' then 'BLOCKED' when least(100,risk_score+15)>=70 then 'HIGH_RISK' when least(100,risk_score+15)>=30 then 'REVIEW' else 'NORMAL' end, last_event_at=now(), review_reason='Perubahan perangkat/IP terdeteksi.', updated_at=now() where user_id=p_user_id;
  end if;
  return v_count;
end $$;

revoke all on function public.observe_security_fingerprint(uuid,text) from public;
grant execute on function public.observe_security_fingerprint(uuid,text) to authenticated,service_role;

create table if not exists public.security_risk_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  status text not null default 'NORMAL' check (status in ('NORMAL','REVIEW','HIGH_RISK','BLOCKED')),
  last_event_at timestamptz,
  review_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.security_rate_limits enable row level security;
alter table public.security_risk_events enable row level security;
alter table public.security_risk_profiles enable row level security;

revoke all on public.security_rate_limits from anon, authenticated;
revoke all on public.security_risk_events from anon, authenticated;
revoke all on public.security_risk_profiles from anon, authenticated;

drop policy if exists "risk_profiles_admin_select" on public.security_risk_profiles;
create policy "risk_profiles_admin_select" on public.security_risk_profiles
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role::text in ('ADMIN','SUPER_ADMIN')));

drop policy if exists "risk_events_admin_select" on public.security_risk_events;
create policy "risk_events_admin_select" on public.security_risk_events
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role::text in ('ADMIN','SUPER_ADMIN')));

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after integer)
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_started timestamptz;
  v_count integer;
  v_now timestamptz := now();
  v_retry integer;
begin
  if p_key_hash is null or length(p_key_hash) < 16 then
    return query select false, 0, greatest(p_window_seconds, 1);
    return;
  end if;
  if p_limit < 1 or p_window_seconds < 1 then
    return query select false, 0, 60;
    return;
  end if;

  insert into public.security_rate_limits(key_hash, window_started_at, request_count, updated_at)
  values (p_key_hash, v_now, 1, v_now)
  on conflict (key_hash) do update
    set window_started_at = case
      when extract(epoch from (v_now - security_rate_limits.window_started_at)) >= p_window_seconds then v_now
      else security_rate_limits.window_started_at
    end,
    request_count = case
      when extract(epoch from (v_now - security_rate_limits.window_started_at)) >= p_window_seconds then 1
      else security_rate_limits.request_count + 1
    end,
    updated_at = v_now;

  select window_started_at, request_count into v_started, v_count
  from public.security_rate_limits where key_hash=p_key_hash;

  if v_count <= p_limit then
    return query select true, greatest(p_limit-v_count,0), 0;
  end if;

  v_retry := greatest(1, ceil(p_window_seconds - extract(epoch from (v_now-v_started)))::integer);
  return query select false, 0, v_retry;
end $$;

create or replace function public.record_security_risk_event(
  p_user_id uuid,
  p_event_type text,
  p_risk_points integer,
  p_reason text,
  p_ip_hash text default null,
  p_user_agent_hash text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.security_risk_profiles
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v public.security_risk_profiles;
  v_score integer;
  v_status text;
begin
  if p_user_id is null then raise exception 'USER_ID_REQUIRED'; end if;
  v_score := least(100, greatest(0, coalesce(p_risk_points,0)));

  insert into public.security_risk_profiles(user_id,risk_score,status,last_event_at,review_reason,updated_at)
  values(p_user_id,v_score,case when v_score >= 70 then 'HIGH_RISK' when v_score >= 30 then 'REVIEW' else 'NORMAL' end,now(),p_reason,now())
  on conflict(user_id) do update set
    risk_score = least(100, public.security_risk_profiles.risk_score + greatest(coalesce(p_risk_points,0),0)),
    status = case
      when public.security_risk_profiles.status = 'BLOCKED' then 'BLOCKED'
      when least(100, public.security_risk_profiles.risk_score + greatest(coalesce(p_risk_points,0),0)) >= 70 then 'HIGH_RISK'
      when least(100, public.security_risk_profiles.risk_score + greatest(coalesce(p_risk_points,0),0)) >= 30 then 'REVIEW'
      else 'NORMAL'
    end,
    last_event_at=now(), review_reason=p_reason, updated_at=now();

  insert into public.security_risk_events(user_id,event_type,risk_points,reason,ip_hash,user_agent_hash,metadata)
  values(p_user_id,p_event_type,greatest(coalesce(p_risk_points,0),0),p_reason,p_ip_hash,p_user_agent_hash,coalesce(p_metadata,'{}'::jsonb));

  select * into v from public.security_risk_profiles where user_id=p_user_id;
  return v;
end $$;

create or replace function public.admin_set_risk_status(
  p_user_id uuid,
  p_status text,
  p_reason text default null
)
returns public.security_risk_profiles
language plpgsql security definer set search_path=public,extensions
as $$
declare v public.security_risk_profiles;
declare v_actor uuid := auth.uid();
begin
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.role::text in ('ADMIN','SUPER_ADMIN')) then
    raise exception 'FORBIDDEN';
  end if;
  if p_status not in ('NORMAL','REVIEW','HIGH_RISK','BLOCKED') then raise exception 'INVALID_STATUS'; end if;
  insert into public.security_risk_profiles(user_id,risk_score,status,review_reason,reviewed_by,reviewed_at,updated_at)
  values(p_user_id,0,p_status,p_reason,v_actor,now(),now())
  on conflict(user_id) do update set status=p_status, review_reason=p_reason, reviewed_by=v_actor, reviewed_at=now(), updated_at=now();
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values(v_actor,'security.risk_status_update','user',p_user_id,jsonb_build_object('status',p_status,'reason',p_reason));
  select * into v from public.security_risk_profiles where user_id=p_user_id;
  return v;
end $$;

revoke all on function public.consume_rate_limit(text,integer,integer) from public;
revoke all on function public.record_security_risk_event(uuid,text,integer,text,text,text,jsonb) from public;
revoke all on function public.admin_set_risk_status(uuid,text,text) from public;
grant execute on function public.consume_rate_limit(text,integer,integer) to anon,authenticated,service_role;
grant execute on function public.record_security_risk_event(uuid,text,integer,text,text,text,jsonb) to service_role;
grant execute on function public.admin_set_risk_status(uuid,text,text) to authenticated,service_role;

create index if not exists security_rate_limits_updated_idx on public.security_rate_limits(updated_at);
create index if not exists security_risk_events_user_created_idx on public.security_risk_events(user_id,created_at desc);
create index if not exists security_risk_events_type_created_idx on public.security_risk_events(event_type,created_at desc);
create index if not exists security_risk_profiles_status_idx on public.security_risk_profiles(status,risk_score desc);


create or replace function public.flag_failed_ppob_risk()
returns trigger
language plpgsql security definer set search_path=public,extensions
as $$
declare v_user uuid; v_count integer;
begin
  if new.status <> 'FAILED' or old.status = 'FAILED' then return new; end if;
  select o.user_id into v_user from public.orders o where o.id=new.order_id;
  if v_user is null then return new; end if;
  select count(*) into v_count from public.ppob_transactions p join public.orders o on o.id=p.order_id
    where o.user_id=v_user and p.status='FAILED' and p.updated_at > now()-interval '30 minutes';
  perform public.record_security_risk_event(v_user,'PPOB_FAILED',least(20,5 + greatest(v_count-1,0)*5),
    'Transaksi PPOB gagal berulang dalam waktu singkat.',null,null,jsonb_build_object('transaction_id',new.id,'failed_count_30m',v_count));
  return new;
end $$;

drop trigger if exists trg_flag_failed_ppob_risk on public.ppob_transactions;
create trigger trg_flag_failed_ppob_risk after update of status on public.ppob_transactions
for each row execute function public.flag_failed_ppob_risk();

create or replace function public.flag_topup_burst_risk()
returns trigger
language plpgsql security definer set search_path=public,extensions
as $$
declare v_count integer;
begin
  select count(*) into v_count from public.topups where user_id=new.user_id and created_at > now()-interval '10 minutes';
  if v_count >= 5 then
    perform public.record_security_risk_event(new.user_id,'TOPUP_BURST',20,
      'Pola Top Up berulang terdeteksi dalam waktu singkat.',null,null,jsonb_build_object('topup_count_10m',v_count));
  end if;
  return new;
end $$;

drop trigger if exists trg_flag_topup_burst_risk on public.topups;
create trigger trg_flag_topup_burst_risk after insert on public.topups
for each row execute function public.flag_topup_burst_risk();

revoke all on function public.flag_failed_ppob_risk() from public,anon,authenticated;
revoke all on function public.flag_topup_burst_risk() from public,anon,authenticated;
