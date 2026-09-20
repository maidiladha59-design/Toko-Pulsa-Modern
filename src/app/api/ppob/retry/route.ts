import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fulfillPpobOrder } from '@/lib/ppob/fulfill';

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret || request.headers.get('x-internal-secret') !== secret) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const { data: claims, error } = await admin.from('ppob_transactions').select('id, order_id').in('status', ['WAITING','PROCESSING']).not('customer_no','is',null).neq('customer_no','pending-target').lt('attempt_count',3).order('next_retry_at', { ascending: true, nullsFirst: true }).limit(20);
  if (error) return NextResponse.json({ message: 'Queue PPOB tidak dapat diambil.' }, { status: 500 });
  let processed = 0;
  for (const claim of claims || []) {
    try { await fulfillPpobOrder(claim.order_id); processed++; }
    catch (e) { console.error('PPOB RETRY ERROR', claim.order_id, e); }
  }
  return NextResponse.json({ ok: true, claimed: claims?.length || 0, processed });
}
