import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login.' }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ message: 'Payload tidak valid.' }, { status: 400 }); }
  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return NextResponse.json({ message: 'Subscription push tidak valid.' }, { status: 400 });
  const { error } = await supabase.from('push_subscriptions').upsert({ user_id:user.id, endpoint:String(sub.endpoint), p256dh:String(sub.keys.p256dh), auth:String(sub.keys.auth), user_agent:request.headers.get('user-agent'), updated_at:new Date().toISOString() }, { onConflict:'user_id,endpoint' });
  if (error) return NextResponse.json({ message:'Gagal menyimpan subscription push.' }, { status:500 });
  return NextResponse.json({ ok:true });
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message:'Silakan login.' }, { status:401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ message:'Payload tidak valid.' }, { status:400 }); }
  if (!body?.endpoint) return NextResponse.json({ message:'Endpoint wajib diisi.' }, { status:400 });
  const { error } = await supabase.from('push_subscriptions').delete().eq('user_id',user.id).eq('endpoint',String(body.endpoint));
  if (error) return NextResponse.json({ message:'Gagal menghapus subscription.' }, { status:500 });
  return NextResponse.json({ ok:true });
}
