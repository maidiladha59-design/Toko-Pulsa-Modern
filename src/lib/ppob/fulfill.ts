import { createAdminClient } from '@/lib/supabase/admin';
import { topupPrepaid, payPostpaid } from '@/lib/ppob/digiflazz';

export async function fulfillPpobOrder(orderId: string) {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from('ppob_transactions')
    .select('id, order_id, order_item_id, provider, provider_ref_id, customer_no, target_data, status, attempt_count, ppob_services(provider, provider_sku, service_kind)')
    .eq('order_id', orderId);

  if (error) throw error;
  if (!rows?.length) return { processed: 0 };

  let processed = 0;
  for (const tx of rows as any[]) {
    if (['SUCCESS', 'FAILED', 'REFUNDED'].includes(tx.status)) continue;
    if (!tx.customer_no || tx.customer_no === 'pending-target') continue;
    if (tx.provider !== 'digiflazz') continue;

    const service = Array.isArray(tx.ppob_services) ? tx.ppob_services[0] : tx.ppob_services;
    if (!service) continue;

    // Atomic claim prevents wallet checkout, webhook, cron and manual retry
    // from sending the same provider transaction twice.
    const { data: claimed, error: claimError } = await admin.rpc('claim_ppob_transaction', { p_transaction_id: tx.id });
    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const response = service.service_kind === 'postpaid'
        ? await payPostpaid({ sku: service.provider_sku, customerNo: tx.customer_no, refId: tx.provider_ref_id })
        : await topupPrepaid({ sku: service.provider_sku, customerNo: tx.customer_no, refId: tx.provider_ref_id });

      const data: any = response.data;
      const status = String(data.status || '').toLowerCase();
      const mapped = status === 'sukses' || status === 'success' ? 'SUCCESS' : status === 'gagal' || status === 'failed' ? 'FAILED' : 'PROCESSING';

      await admin.from('ppob_transactions').update({
        status: mapped,
        provider_status: data.status || null,
        response_code: data.rc || null,
        serial_number: data.sn || null,
        provider_message: data.message || null,
        provider_payload: data,
        completed_at: mapped === 'SUCCESS' ? new Date().toISOString() : null,
        next_retry_at: mapped === 'PROCESSING' ? new Date(Date.now() + 2 * 60 * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', tx.id);
      processed++;
    } catch (error: any) {
      await admin.from('ppob_transactions').update({
        status: 'PROCESSING',
        provider_message: String(error?.message || 'Provider request failed'),
        next_retry_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', tx.id);
    }
  }

  const { data: remaining } = await admin.from('ppob_transactions').select('status').eq('order_id', orderId);
  const statuses = remaining?.map((x: any) => x.status) || [];
  if (statuses.length && statuses.every((s) => s === 'SUCCESS')) {
    await admin.rpc('finalize_ppob_order', { p_order_id: orderId });
  } else if (statuses.some((s) => s === 'FAILED')) {
    await admin.rpc('finalize_ppob_order', { p_order_id: orderId });
  }

  return { processed };
}
