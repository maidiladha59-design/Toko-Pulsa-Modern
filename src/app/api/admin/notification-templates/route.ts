import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function adminUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return data && ['ADMIN','SUPER_ADMIN'].includes(data.role) ? user : null;
}

export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const { data, error } = await createAdminClient().from('notification_templates').select('*').order('event_key');
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ templates: data || [] });
}

export async function PATCH(req: Request) {
  if (!(await adminUser())) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const id = String(body?.id || '');
  if (!id) return NextResponse.json({ message: 'ID template wajib.' }, { status: 400 });
  const updates = {
    title: String(body?.title || '').trim(), subtitle: String(body?.subtitle || '').trim(), message: String(body?.message || '').trim(),
    enabled: body?.enabled !== false, push_enabled: body?.push_enabled !== false, in_app_enabled: body?.in_app_enabled !== false,
    updated_at: new Date().toISOString(),
  };
  if (updates.title.length < 2) return NextResponse.json({ message: 'Judul minimal 2 karakter.' }, { status: 400 });
  const { data, error } = await createAdminClient().from('notification_templates').update(updates).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ template: data });
}
