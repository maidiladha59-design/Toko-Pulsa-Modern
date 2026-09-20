import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyWebhookSignature } from '@/lib/ppob/digiflazz';
import { fulfillPpobOrder } from '@/lib/ppob/fulfill';
import { notifyUser } from '@/lib/notification-engine';

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get('x-hub-signature'))) return NextResponse.json({ ok: false }, { status: 401 });
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const data = body?.data;
  if (!data?.ref_id) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const eventKey = crypto.createHash('sha256').update(raw).digest('hex');
  const { data: event, error: eventError } = await admin
    .from('ppob_webhook_events')
    .insert({ provider: 'digiflazz', event_key: eventKey, ref_id: String(data.ref_id), payload: body })
    .select('id')
    .single();

  if (eventError) {
    // A duplicate hash means the provider retried the same webhook. Acknowledge it
    // without applying the status transition twice.
    if (eventError.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
    console.error('PPOB WEBHOOK AUDIT ERROR', eventError);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const { data: tx } = await admin.from('ppob_transactions').select('id, order_id').eq('provider_ref_id', data.ref_id).maybeSingle();
  if (!tx) {
    await admin.from('ppob_webhook_events').update({ status: 'IGNORED', processed_at: new Date().toISOString() }).eq('id', event.id);
    return NextResponse.json({ ok: true });
  }

  const status = String(data.status || '').toLowerCase();
  const mapped = status === 'sukses' ? 'SUCCESS' : status === 'gagal' ? 'FAILED' : 'PROCESSING';
  await admin.from('ppob_transactions').update({
    status: mapped,
    provider_status: data.status || null,
    response_code: data.rc || null,
    serial_number: data.sn || null,
    provider_message: data.message || null,
    provider_payload: data,
    completed_at: mapped === 'SUCCESS' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', tx.id);

  try {
    if (mapped === 'SUCCESS' || mapped === 'FAILED') {
      await fulfillPpobOrder(tx.order_id);
      const { data: order } = await admin.from('orders').select('user_id,total_amount').eq('id', tx.order_id).maybeSingle();
      if (order) await notifyUser({ userId: order.user_id, eventKey: mapped === 'SUCCESS' ? 'TRANSACTION_SUCCESS' : 'TRANSACTION_FAILED', variables: { amount: `Rp${Number(order.total_amount).toLocaleString('id-ID')}`, reference: String(data.ref_id) }, referenceType: 'order', referenceId: tx.order_id, url: `/orders/${tx.order_id}` });
    }
    await admin.from('ppob_webhook_events').update({ status: 'PROCESSED', processed_at: new Date().toISOString() }).eq('id', event.id);
  } catch (error: any) {
    await admin.from('ppob_webhook_events').update({ status: 'ERROR', error_message: String(error?.message || 'Webhook processing failed'), processed_at: new Date().toISOString() }).eq('id', event.id);
    throw error;
  }
  return NextResponse.json({ ok: true });
}
