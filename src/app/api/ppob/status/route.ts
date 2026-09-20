import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login.' }, { status: 401 });
  const orderId = new URL(request.url).searchParams.get('order_id');
  if (!orderId) return NextResponse.json({ message: 'order_id wajib.' }, { status: 400 });
  const { data: order, error } = await supabase.from('orders').select('id, order_number, status, total_amount, payment_method, created_at, updated_at').eq('id', orderId).eq('user_id', user.id).maybeSingle();
  if (error || !order) return NextResponse.json({ message: 'Order tidak ditemukan.' }, { status: 404 });
  const { data: transactions } = await supabase.from('ppob_transactions').select('id, customer_no, status, provider_status, response_code, serial_number, provider_message, attempt_count, last_attempt_at, completed_at').eq('order_id', orderId);
  return NextResponse.json({ order, transactions: transactions || [] });
}
