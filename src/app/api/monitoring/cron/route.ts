import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrepaidPriceList } from '@/lib/ppob/digiflazz';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const checks: any[] = [];
  const configured = Boolean(process.env.DIGIFLAZZ_USERNAME && process.env.DIGIFLAZZ_API_KEY);
  const started = Date.now();
  if (!configured) {
    const row = { provider: 'digiflazz', check_type: 'prepaid_pricelist', status: 'NOT_CONFIGURED', latency_ms: null, message: 'Credential Digiflazz belum dikonfigurasi.', metadata: { testing: process.env.DIGIFLAZZ_TESTING === 'true' } };
    await admin.from('provider_health_checks').insert(row); checks.push(row);
  } else {
    try {
      const result = await getPrepaidPriceList();
      const count = Array.isArray(result.data) ? result.data.length : 0;
      const row = { provider: 'digiflazz', check_type: 'prepaid_pricelist', status: count > 0 ? 'UP' : 'DEGRADED', latency_ms: Date.now() - started, message: count > 0 ? 'Pricelist berhasil diambil.' : 'Response provider tidak berisi SKU.', metadata: { sku_count: count, testing: process.env.DIGIFLAZZ_TESTING === 'true' } };
      await admin.from('provider_health_checks').insert(row); checks.push(row);
      if (row.status !== 'UP') await admin.rpc('upsert_monitoring_alert', { p_fingerprint: 'provider:digiflazz:health', p_severity: 'WARNING', p_category: 'PROVIDER', p_title: 'Digiflazz provider degraded', p_message: row.message, p_source: 'v55-monitoring' });
    } catch (error: any) {
      const row = { provider: 'digiflazz', check_type: 'prepaid_pricelist', status: 'DOWN', latency_ms: Date.now() - started, message: error?.message || 'Provider tidak dapat dihubungi.', metadata: { testing: process.env.DIGIFLAZZ_TESTING === 'true' } };
      await admin.from('provider_health_checks').insert(row); checks.push(row);
      await admin.rpc('upsert_monitoring_alert', { p_fingerprint: 'provider:digiflazz:health', p_severity: 'CRITICAL', p_category: 'PROVIDER', p_title: 'Digiflazz provider tidak tersedia', p_message: row.message, p_source: 'v55-monitoring' });
    }
  }
  return NextResponse.json({ ok: true, checked_at: new Date().toISOString(), checks });
}
