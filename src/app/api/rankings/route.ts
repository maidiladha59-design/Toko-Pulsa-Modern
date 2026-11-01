import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login.' }, { status: 401 });

  const admin = createAdminClient();
  const [{ data: me }, { data: top }] = await Promise.all([
    admin.from('user_rankings').select('user_id,rank,successful_transactions,successful_amount').eq('user_id', user.id).maybeSingle(),
    admin.from('user_rankings').select('user_id,rank,successful_transactions,successful_amount').order('rank', { ascending: true }).limit(10),
  ]);

  const ids = [...new Set((top || []).map((x) => x.user_id))];
  let profiles: any[] = [];
  if (ids.length) {
    const result = await admin.from('profiles').select('id,full_name,email,avatar_url').in('id', ids);
    profiles = result.data || [];
  }
  const map = new Map(profiles.map((p) => [p.id, p]));

  // Hanya status untuk lencana tampilan; data ranking dan urutannya tidak berubah.
  const statusIds = [...new Set([...ids, ...(me ? [user.id] : [])])];
  const verifiedIds = new Set<string>();
  if (statusIds.length) {
    const { data: verified } = await admin
      .from('kyc_verifications')
      .select('user_id')
      .in('user_id', statusIds)
      .eq('status', 'VERIFIED');
    for (const row of verified || []) verifiedIds.add(row.user_id);
  }

  return NextResponse.json({
    me: me ? { ...me, verified: verifiedIds.has(user.id) } : null,
    top: (top || []).map((r) => ({
      ...r,
      verified: verifiedIds.has(r.user_id),
      profile: map.get(r.user_id) || null,
    })),
  });
}
