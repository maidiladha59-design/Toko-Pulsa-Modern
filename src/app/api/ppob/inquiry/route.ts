import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inquiryPostpaid } from '@/lib/ppob/digiflazz';
import { resolvePricingRule, type PricingRule } from '@/lib/ppob/pricing';

const schema = z.object({
  service_id: z.string().uuid(),
  customer_no: z.string().min(3).max(64),
  extra: z.record(z.unknown()).optional(),
});

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login terlebih dahulu.' }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Data inquiry tidak valid.' }, { status: 400 });

  const { data: service } = await supabase
    .from('ppob_services')
    .select('id, product_id, provider, provider_sku, service_kind, category, brand')
    .eq('id', parsed.data.service_id)
    .eq('provider_active', true)
    .single();

  if (!service || service.provider !== 'digiflazz' || service.service_kind !== 'postpaid') {
    return NextResponse.json({ message: 'Layanan inquiry tidak tersedia.' }, { status: 404 });
  }

  const refId = `INQ-${crypto.randomUUID()}`;
  try {
    const result = await inquiryPostpaid({
      sku: service.provider_sku,
      customerNo: parsed.data.customer_no,
      refId,
      extra: parsed.data.extra,
    });

    const data: any = result.data;
    const status = String(data?.status || '').toLowerCase();
    if (status !== 'sukses' && status !== 'success') {
      return NextResponse.json({ message: data?.message || 'Tagihan tidak ditemukan.', data }, { status: 422 });
    }

    const providerPrice = money(data?.price);
    const providerAdmin = money(data?.admin);
    const providerSelling = money(data?.selling_price) || providerPrice + providerAdmin;
    const admin = createAdminClient();
    const { data: rules } = await admin.from('ppob_pricing_rules').select('*').eq('is_active', true);
    const normalizedRules = ((rules || []) as any[]).map((r) => ({ ...r, fee_value: Number(r.fee_value), min_fee: r.min_fee == null ? null : Number(r.min_fee), max_fee: r.max_fee == null ? null : Number(r.max_fee), min_amount: r.min_amount == null ? 0 : Number(r.min_amount), max_amount: r.max_amount == null ? null : Number(r.max_amount), priority: Number(r.priority || 0) })) as PricingRule[];
    const resolved = resolvePricingRule(normalizedRules, { category: service.category, brand: service.brand, sku: service.provider_sku, amount: providerSelling });
    const aidilFee = resolved.fee;
    const quoteAmount = providerSelling + aidilFee;
    if (quoteAmount <= 0) return NextResponse.json({ message: 'Nominal tagihan dari provider tidak valid.' }, { status: 422 });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: quote, error } = await admin.from('ppob_inquiries').insert({
      user_id: user.id,
      service_id: service.id,
      product_id: service.product_id,
      customer_no: parsed.data.customer_no,
      provider_price: providerPrice,
      provider_admin: providerAdmin,
      provider_selling_price: providerSelling,
      aidil_fee: aidilFee,
      pricing_rule_id: resolved.rule?.id || null,
      quote_amount: quoteAmount,
      payload: data,
      expires_at: expiresAt,
      status: 'ACTIVE',
    }).select('id, customer_no, provider_price, provider_admin, provider_selling_price, aidil_fee, pricing_rule_id, quote_amount, payload, expires_at').single();

    if (error || !quote) {
      return NextResponse.json({ message: 'Hasil inquiry tidak dapat disimpan.' }, { status: 500 });
    }

    return NextResponse.json({
      inquiry_id: quote.id,
      customer_no: quote.customer_no,
      amount: quote.quote_amount,
      expires_at: quote.expires_at,
      data: quote.payload,
      breakdown: {
        provider_price: quote.provider_price,
        provider_admin: quote.provider_admin,
        provider_selling_price: quote.provider_selling_price,
        aidil_fee: quote.aidil_fee,
        pricing_rule_id: quote.pricing_rule_id,
        total: quote.quote_amount,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ message: error?.message || 'Inquiry gagal.' }, { status: 502 });
  }
}
