import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fulfillPpobOrder } from '@/lib/ppob/fulfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: claims, error } = await admin.from('ppob_transactions').select('id, order_id').in('status', ['WAITING','PROCESSING']).not('customer_no','is',null).neq('customer_no','pending-target').lt('attempt_count',3).order('next_retry_at', { ascending: true, nullsFirst: true }).limit(20);
  if (error) {
    console.error('PPOB CRON CLAIM ERROR', error);
    return NextResponse.json({ ok: false, message: 'Queue PPOB tidak dapat diambil.' }, { status: 500 });
  }

  const results: Array<{ order_id: string; ok: boolean; processed?: number; error?: string }> = [];
  const seen = new Set<string>();
  for (const claim of claims || []) {
    if (!claim.order_id || seen.has(claim.order_id)) continue;
    seen.add(claim.order_id);
    try {
      const result = await fulfillPpobOrder(claim.order_id);
      results.push({ order_id: claim.order_id, ok: true, processed: result.processed });
    } catch (err: any) {
      console.error('PPOB CRON FULFILL ERROR', claim.order_id, err);
      results.push({ order_id: claim.order_id, ok: false, error: String(err?.message || 'Fulfillment failed') });
    }
  }

  return NextResponse.json({
    ok: true,
    claimed: claims?.length || 0,
    orders: results.length,
    results,
    at: new Date().toISOString(),
  });
}
