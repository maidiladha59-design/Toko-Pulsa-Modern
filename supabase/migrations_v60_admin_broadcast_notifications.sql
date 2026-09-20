-- AIDIL STORE v60: Admin broadcast notifications
-- Jalankan setelah migration notifikasi yang sudah ada.

alter table public.notifications
  add column if not exists subtitle text not null default '',
  add column if not exists reference_type text,
  add column if not exists reference_id uuid;

create index if not exists notifications_reference_idx
  on public.notifications(reference_type, reference_id, created_at desc);

create table if not exists public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text not null default '',
  message text not null default '',
  is_active boolean not null default true,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_broadcasts_created_idx
  on public.notification_broadcasts(created_at desc);

alter table public.notification_broadcasts enable row level security;

drop policy if exists notification_broadcasts_admin_select on public.notification_broadcasts;
drop policy if exists notification_broadcasts_admin_insert on public.notification_broadcasts;
drop policy if exists notification_broadcasts_admin_update on public.notification_broadcasts;
drop policy if exists notification_broadcasts_admin_delete on public.notification_broadcasts;

create policy notification_broadcasts_admin_select
  on public.notification_broadcasts for select
  using (public.is_admin());

create policy notification_broadcasts_admin_insert
  on public.notification_broadcasts for insert
  with check (public.is_admin());

create policy notification_broadcasts_admin_update
  on public.notification_broadcasts for update
  using (public.is_admin())
  with check (public.is_admin());

create policy notification_broadcasts_admin_delete
  on public.notification_broadcasts for delete
  using (public.is_admin());
