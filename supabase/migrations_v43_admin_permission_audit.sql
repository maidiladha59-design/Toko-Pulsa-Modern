-- AIDIL STORE v43: granular admin permissions + audit center
create table if not exists public.admin_role_permissions (
  role text not null check (role in ('ADMIN','SUPER_ADMIN')),
  permission text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(role,permission)
);

insert into public.admin_role_permissions(role,permission,enabled)
select r.role,p.permission,true
from (values ('ADMIN'),('SUPER_ADMIN')) r(role)
cross join (values
 ('dashboard.view'),('products.manage'),('categories.manage'),('orders.manage'),('support.manage'),
 ('users.view'),('users.role_manage'),('wallet.adjust'),('topups.manage'),('payments.manage'),
 ('platform.manage'),('pricing.manage'),('analytics.view'),('finance.view'),('reconciliation.manage'),
 ('promos.manage'),('ppob.manage'),('ppob.monitor'),('audit.view'),('permissions.manage')
) p(permission)
on conflict (role,permission) do nothing;

-- ADMIN cannot change permissions; SUPER_ADMIN can.
update public.admin_role_permissions set enabled=false where role='ADMIN' and permission='permissions.manage';

create or replace function public.has_admin_permission(p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles pr
    join public.admin_role_permissions rp on rp.role=pr.role::text and rp.permission=p_permission and rp.enabled
    where pr.id=auth.uid() and pr.role in ('ADMIN','SUPER_ADMIN')
  );
$$;

create or replace function public.can_admin_permission(p_actor uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles pr
    join public.admin_role_permissions rp on rp.role=pr.role::text and rp.permission=p_permission and rp.enabled
    where pr.id=p_actor and pr.role in ('ADMIN','SUPER_ADMIN')
  );
$$;

alter table public.admin_role_permissions enable row level security;
drop policy if exists admin_role_permissions_select on public.admin_role_permissions;
create policy admin_role_permissions_select on public.admin_role_permissions for select using (public.is_admin());

-- Centralized audit query is admin-only; audit_logs remains append-only from trusted server functions.
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id,created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs(action,created_at desc);

create or replace function public.update_admin_permission(p_actor uuid,p_role text,p_permission text,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='SUPER_ADMIN') then raise exception 'SUPER_ADMIN_ONLY'; end if;
  if p_role not in ('ADMIN','SUPER_ADMIN') then raise exception 'INVALID_ROLE'; end if;
  if not exists(select 1 from public.admin_role_permissions where role=p_role and permission=p_permission) then raise exception 'UNKNOWN_PERMISSION'; end if;
  update public.admin_role_permissions set enabled=p_enabled,updated_at=now() where role=p_role and permission=p_permission;
  insert into public.audit_logs(actor_id,action,target_type,metadata) values(p_actor,'admin.permission_update','admin_role_permission',jsonb_build_object('role',p_role,'permission',p_permission,'enabled',p_enabled));
end $$;

grant execute on function public.has_admin_permission(text) to authenticated;
grant execute on function public.update_admin_permission(uuid,text,text,boolean) to authenticated;
