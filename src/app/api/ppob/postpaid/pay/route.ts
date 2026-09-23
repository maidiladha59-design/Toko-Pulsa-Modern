import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createGatewayTransaction, extractGatewayPaymentNumber, isGatewayConfigured, type GatewayMethod } from '@/lib/fr3newera';
import QRCode from 'qrcode';
import { fulfillPpobOrder } from '@/lib/ppob/fulfill';
import { verifyTransactionPin } from '@/lib/security/transaction-pin';

const schema = z.object({
  inquiry_id: z.string().uuid(),
  idempotency_key: z.string().min(10),
  method: z.enum(['WALLET','QRIS','BANK']),
  gateway_method: z.string().optional(),
  pin: z.string().optional(),
});

// FR3 NEWERA hanya menyediakan QRIS (tidak ada Virtual Account seperti Pakasir).
const allowedGateway = new Set(['qris']);

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login terlebih dahulu.' }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Data pembayaran pascabayar tidak valid.' }, { status: 400 });

  const { inquiry_id, idempotency_key, method, pin } = parsed.data;
  const gatewayMethod = parsed.data.gateway_method || (method === 'QRIS' ? 'qris' : '');
  if (method !== 'WALLET' && !allowedGateway.has(gatewayMethod)) {
    return NextResponse.json({ message: 'Metode pembayaran tidak valid.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: inquiry } = await admin.from('ppob_inquiries')
    .select('id, status, expires_at, order_id, quote_amount')
    .eq('id', inquiry_id).eq('user_id', user.id).single();
  if (!inquiry) return NextResponse.json({ message: 'Inquiry tidak ditemukan.' }, { status: 404 });
  if (inquiry.status === 'ACTIVE' && new Date(inquiry.expires_at).getTime() <= Date.now()) {
    await admin.from('ppob_inquiries').update({ status: 'EXPIRED' }).eq('id', inquiry.id).eq('status', 'ACTIVE');
    return NextResponse.json({ message: 'Inquiry sudah kedaluwarsa. Silakan cek tagihan lagi.' }, { status: 410 });
  }

  if (method === 'WALLET') {
    if (!pin) return NextResponse.json({ message: 'PIN transaksi wajib diisi.' }, { status: 400 });
    try { await verifyTransactionPin(user.id, pin); } catch (e: any) {
      if (e?.message === 'PIN_NOT_SET') return NextResponse.json({ message: 'Buat PIN transaksi terlebih dahulu di Pengaturan.' }, { status: 409 });
      if (e?.message === 'PIN_LOCKED') return NextResponse.json({ message: 'PIN terkunci sementara karena terlalu banyak percobaan gagal.' }, { status: 429 });
      return NextResponse.json({ message: 'PIN transaksi salah.' }, { status: 401 });
    }
    const { data: orderId, error } = await supabase.rpc('create_ppob_postpaid_wallet_order', {
      p_user_id: user.id, p_inquiry_id: inquiry.id, p_idempotency_key: idempotency_key,
    });
    if (error || !orderId) {
      const m = error?.message || '';
      if (m.includes('INSUFFICIENT_BALANCE')) return NextResponse.json({ message: 'Saldo tidak mencukupi.' }, { status: 402 });
      if (m.includes('INQUIRY_EXPIRED')) return NextResponse.json({ message: 'Inquiry sudah kedaluwarsa.' }, { status: 410 });
      if (m.includes('INQUIRY_NOT_FOUND')) return NextResponse.json({ message: 'Inquiry tidak ditemukan.' }, { status: 404 });
      return NextResponse.json({ message: 'Gagal membuat pembayaran pascabayar.' }, { status: 500 });
    }
    try { await fulfillPpobOrder(orderId as string); } catch (e) { console.error('POSTPAID WALLET FULFILL', e); }
    return NextResponse.json({ order_id: orderId, amount: inquiry.quote_amount, payment_method: 'WALLET', status: 'PROCESSING' }, { status: 201 });
  }

  if (!isGatewayConfigured()) return NextResponse.json({ message: 'Pembayaran otomatis belum dikonfigurasi.' }, { status: 503 });

  const { data: order, error } = await supabase.rpc('create_ppob_postpaid_gateway_order', {
    p_user_id: user.id,
    p_inquiry_id: inquiry.id,
    p_idempotency_key: idempotency_key,
    p_payment_method: method === 'QRIS' ? 'QRIS' : 'BANK_VA',
    p_gateway_method: gatewayMethod,
  }).single();
  if (error || !order) {
    const m = error?.message || '';
    if (m.includes('INQUIRY_EXPIRED')) return NextResponse.json({ message: 'Inquiry sudah kedaluwarsa.' }, { status: 410 });
    if (m.includes('INQUIRY_NOT_FOUND')) return NextResponse.json({ message: 'Inquiry tidak ditemukan.' }, { status: 404 });
    return NextResponse.json({ message: 'Gagal membuat order pascabayar.' }, { status: 500 });
  }

  const o = order as { order_id: string; order_number: string; total_amount: number };
  const { data: existing } = await admin.from('orders').select('payment_number,qris_payload,qris_expired_at,payment_method,status,total_amount').eq('id', o.order_id).single();
  const existingNumber = existing?.payment_number || existing?.qris_payload;
  if (existingNumber && existing?.status === 'PENDING') {
    const isQris = existing.payment_method === 'QRIS';
    return NextResponse.json({ order_id:o.order_id, order_number:o.order_number, amount:existing.total_amount, payment_method:existing.payment_method, gateway_method:gatewayMethod, payment_number:existingNumber, expired_at:existing.qris_expired_at, qris_image:isQris ? await QRCode.toDataURL(existingNumber,{margin:1,width:360}) : null }, { status:201 });
  }

  try {
    const payment = await createGatewayTransaction(o.order_number, o.total_amount, gatewayMethod as GatewayMethod);
    const isQris = gatewayMethod === 'qris';
    const paymentNumber = extractGatewayPaymentNumber(payment);
    const totalPayment = payment.total_payment ?? o.total_amount;
    if (!payment.txn_id || !paymentNumber) throw new Error('GATEWAY_INVALID_RESPONSE');
    const { error: saveError } = await admin.from('orders').update({
      payment_method:isQris?'QRIS':'BANK_VA', gateway_reference:o.order_number, gateway_txn_id:payment.txn_id, gateway_method:gatewayMethod,
      payment_number:paymentNumber, qris_payload:isQris?paymentNumber:null,
      qris_expired_at:payment.expired_at, gateway_fee:payment.fee ?? 0, gateway_total_payment:totalPayment, updated_at:new Date().toISOString()
    }).eq('id',o.order_id).eq('status','PENDING');
    if (saveError) throw saveError;
    return NextResponse.json({ order_id:o.order_id, order_number:o.order_number, amount:totalPayment, base_amount:payment.amount, fee:payment.fee ?? 0, payment_method:isQris?'QRIS':'BANK_VA', gateway_method:gatewayMethod, payment_number:paymentNumber, expired_at:payment.expired_at, qris_image:isQris?await QRCode.toDataURL(paymentNumber,{margin:1,width:360}):null }, { status:201 });
  } catch (e) {
    await admin.from('orders').update({ status:'FAILED', updated_at:new Date().toISOString() }).eq('id',o.order_id).eq('status','PENDING');
    return NextResponse.json({ message:'Gagal membuat instruksi pembayaran.' }, { status:502 });
  }
}
