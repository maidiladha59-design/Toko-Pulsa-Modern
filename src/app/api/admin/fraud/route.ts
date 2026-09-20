import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function adminUser() {
  const s = createClient();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return null;
  const { data: profile } = await s.from('profiles').select('role').eq('id', user.id).single();
  return profile && ['ADMIN', 'SUPER_ADMIN'].includes(String(profile.role)) ? user : null;
}

export async function GET(req: Request) {
  if (!(await adminUser())) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get('limit') || 100)));
  const admin = createAdminClient();
  const [{ data: profiles, error: pe }, { data: events, error: ee }] = await Promise.all([
    admin.from('security_risk_profiles').select('user_id,risk_score,status,last_event_at,review_reason,reviewed_by,reviewed_at,updated_at').order('risk_score', { ascending: false }).limit(limit),
    admin.from('security_risk_events').select('id,user_id,event_type,risk_points,reason,metadata,created_at').order('created_at', { ascending: false }).limit(limit),
  ]);
  if (pe || ee) return NextResponse.json({ message: pe?.message || ee?.message || 'Gagal memuat Risk Center.' }, { status: 500 });
  return NextResponse.json({ profiles: profiles || [], events: events || [] });
}

export async function POST(req: Request) {
  if (!(await adminUser())) return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const userId = String(body?.user_id || '');
  const status = String(body?.status || '');
  const reason = String(body?.reason || '').trim().slice(0, 500) || null;
  if (!userId || !['NORMAL', 'REVIEW', 'HIGH_RISK', 'BLOCKED'].includes(status)) return NextResponse.json({ message: 'Data risk tidak valid.' }, { status: 400 });
  const { data, error } = await createAdminClient().rpc('admin_set_risk_status', { p_user_id: userId, p_status: status, p_reason: reason });
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, profile: data });
}
