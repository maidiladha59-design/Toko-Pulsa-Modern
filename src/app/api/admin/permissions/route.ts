import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function actor() {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return null;
  const { data: p } = await s.from('profiles').select('role').eq('id', user.id).single();
  return p && p.role==='SUPER_ADMIN' ? user : null;
}

export async function GET() {
  const u = await actor();
  if (!u) return NextResponse.json({ message: 'SUPER_ADMIN diperlukan.' }, { status: 403 });
  const { data, error } = await createAdminClient()
    .from('admin_role_permissions')
    .select('*')
    .eq('role', 'ADMIN')
    .order('permission');
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ permissions: data || [] });
}

export async function POST(req: Request) {
  const u = await actor();
  if (!u) return NextResponse.json({ message: 'SUPER_ADMIN diperlukan.' }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (b?.role !== 'ADMIN' || !b?.permission || typeof b.enabled !== 'boolean') {
    return NextResponse.json({ message: 'Hanya permission role ADMIN yang dapat diubah.' }, { status: 400 });
  }
  const { error } = await createAdminClient().rpc('update_admin_permission', {
    p_actor: u.id, p_role: b.role, p_permission: b.permission, p_enabled: b.enabled
  });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
