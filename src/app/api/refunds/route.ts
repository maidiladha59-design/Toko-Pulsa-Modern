import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({ order_id: z.string().uuid(), reason: z.string().trim().min(5).max(500) });

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login terlebih dahulu.' }, { status: 401 });
  const { data, error } = await supabase.from('refunds').select('id,order_id,amount,reason,status,source,processed_at,created_at,updated_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ refunds: data || [] });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login terlebih dahulu.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Data refund tidak valid.' }, { status: 400 });
  const { data, error } = await supabase.rpc('request_customer_refund', { p_order_id: parsed.data.order_id, p_reason: parsed.data.reason });
  if (error) return NextResponse.json({ message: error.message }, { status: 409 });
  return NextResponse.json({ ok: true, refund_id: data, message: 'Permintaan refund berhasil dikirim dan menunggu pemeriksaan admin.' });
}
