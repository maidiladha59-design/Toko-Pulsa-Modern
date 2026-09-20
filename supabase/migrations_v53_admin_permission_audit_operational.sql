-- AIDIL STORE v53: Admin Permission & Audit Center operational hardening
-- Keeps ADMIN permissions granular and prevents SUPER_ADMIN self-lockout.

-- Fix enum/text comparison for installations where profiles.role is user_role enum.
create or replace function public.has_admin_permission(p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.admin_role_permissions rp
      on rp.role=pr.role::text
     and rp.permission=p_permission
     and rp.enabled=true
    where pr.id=auth.uid()
      and pr.role::text in ('ADMIN','SUPER_ADMIN')
  );
$$;

create or replace function public.can_admin_permission(p_actor uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1
    from public.profiles pr
    join public.admin_role_permissions rp
      on rp.role=pr.role::text
     and rp.permission=p_permission
     and rp.enabled=true
    where pr.id=p_actor
      and pr.role::text in ('ADMIN','SUPER_ADMIN')
  );
$$;

create or replace function public.update_admin_permission(p_actor uuid,p_role text,p_permission text,p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor and role::text='SUPER_ADMIN') then
    raise exception 'SUPER_ADMIN_ONLY';
  end if;
  if p_role not in ('ADMIN','SUPER_ADMIN') then raise exception 'INVALID_ROLE'; end if;
  if p_role='SUPER_ADMIN' then raise exception 'SUPER_ADMIN_PERMISSIONS_LOCKED'; end if;
  if not exists(select 1 from public.admin_role_permissions where role=p_role and permission=p_permission) then
    raise exception 'UNKNOWN_PERMISSION';
  end if;
  update public.admin_role_permissions
    set enabled=p_enabled,updated_at=now()
    where role=p_role and permission=p_permission;
  insert into public.audit_logs(actor_id,action,target_type,metadata)
    values(p_actor,'admin.permission_update','admin_role_permission',
      jsonb_build_object('role',p_role,'permission',p_permission,'enabled',p_enabled));
end $$;

-- Useful indexes for the audit center filters.
create index if not exists audit_logs_target_type_idx
  on public.audit_logs(target_type,created_at desc);
create index if not exists audit_logs_target_id_idx
  on public.audit_logs(target_id,created_at desc);

-- Audit access is itself permission-gated at the database layer for trusted callers.
grant execute on function public.has_admin_permission(text) to authenticated;
grant execute on function public.can_admin_permission(uuid,text) to authenticated;
grant execute on function public.update_admin_permission(uuid,text,text,boolean) to authenticated;
