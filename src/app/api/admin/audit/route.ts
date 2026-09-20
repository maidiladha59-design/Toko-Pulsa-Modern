import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await s.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['ADMIN', 'SUPER_ADMIN'].includes(String(profile.role))) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data: allowed, error: permissionError } = await createAdminClient()
    .rpc('can_admin_permission', { p_actor: user.id, p_permission: 'audit.view' });
  if (permissionError || allowed !== true) {
    return NextResponse.json({ message: 'Permission audit.view diperlukan.' }, { status: 403 });
  }

  const u = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get('limit') || 100)));
  const offset = Math.max(0, Number(u.searchParams.get('offset') || 0));
  const action = u.searchParams.get('action')?.trim();
  const targetType = u.searchParams.get('target_type')?.trim();
  const actorId = u.searchParams.get('actor_id')?.trim();

  let q = createAdminClient()
    .from('audit_logs')
    .select('id,actor_id,action,target_type,target_id,metadata,created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (action) q = q.ilike('action', `%${action}%`);
  if (targetType) q = q.eq('target_type', targetType);
  if (actorId) q = q.eq('actor_id', actorId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [], offset, limit, has_more: (data || []).length === limit });
}
