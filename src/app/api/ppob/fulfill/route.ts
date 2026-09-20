import { NextResponse } from 'next/server';
import { fulfillPpobOrder } from '@/lib/ppob/fulfill';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret || request.headers.get('x-internal-secret') !== secret) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const orderId = typeof body?.order_id === 'string' ? body.order_id : '';
  if (!orderId) return NextResponse.json({ message: 'order_id wajib.' }, { status: 400 });

  try {
    const result = await fulfillPpobOrder(orderId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('PPOB FULFILL ERROR', error);
    return NextResponse.json({ message: 'PPOB belum dapat diproses.' }, { status: 500 });
  }
}
