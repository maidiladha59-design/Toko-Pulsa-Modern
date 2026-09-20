-- AIDIL STORE V65: successful transaction ranking
-- Ranking = number of COMPLETED orders. FAILED/CANCELLED/REFUNDED are excluded.
-- Ties are broken by successful transaction value, then user id.

create table if not exists public.user_rankings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rank integer,
  successful_transactions integer not null default 0,
  successful_amount bigint not null default 0,
  previous_rank integer,
  last_rank_notified_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists user_rankings_rank_idx on public.user_rankings(rank);
create index if not exists user_rankings_successful_transactions_idx on public.user_rankings(successful_transactions desc);

alter table public.user_rankings enable row level security;

drop policy if exists user_rankings_select_own on public.user_rankings;
create policy user_rankings_select_own on public.user_rankings
for select using (auth.uid() = user_id or public.is_admin());

-- Notification templates. These are editable from the existing admin notification-template UI.
insert into public.notification_templates
  (event_key, title, subtitle, message)
values
  ('RANKING_POSITION', 'Peringkat Transaksi Kamu 🏆', 'Posisi kamu saat ini: #{{rank}}', 'Kamu berada di peringkat #{{rank}} dengan {{successful_transactions}} transaksi berhasil.'),
  ('RANKING_UP_ONE', 'Naik 1 Peringkat! 🥳', 'Kamu naik ke posisi #{{rank}}', 'Selamat! Peringkat transaksi kamu naik 1 tingkat menjadi #{{rank}}.'),
  ('RANKING_CHANGED', 'Peringkat Transaksi Diperbarui 🏆', 'Posisi kamu sekarang #{{rank}}', 'Peringkat kamu sekarang #{{rank}} dengan {{successful_transactions}} transaksi berhasil.')
on conflict (event_key) do nothing;

-- Helpful view for server/admin analytics.
create or replace view public.successful_user_transaction_ranking as
with totals as (
  select
    o.user_id,
    count(*)::integer as successful_transactions,
    coalesce(sum(o.total_amount), 0)::bigint as successful_amount
  from public.orders o
  where o.status = 'COMPLETED'
  group by o.user_id
), ranked as (
  select
    user_id,
    row_number() over (
      order by successful_transactions desc, successful_amount desc, user_id
    )::integer as rank,
    successful_transactions,
    successful_amount
  from totals
)
select * from ranked;

-- Grant only what is needed for server-side/admin access; the view is still protected by the
-- application route using the service-role client. No broad anon/authenticated grant is added here.
