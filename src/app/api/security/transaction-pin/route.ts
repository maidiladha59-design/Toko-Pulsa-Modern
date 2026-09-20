import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashTransactionPin, validateTransactionPin, verifyTransactionPin } from '@/lib/security/transaction-pin';

const schema = z.object({
  action: z.enum(['status','set','change','verify']),
  pin: z.string().optional(),
  current_pin: z.string().optional(),
});

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login terlebih dahulu.' }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin.from('user_transaction_security').select('pin_hash,pin_changed_at,pin_locked_until').eq('user_id', user.id).maybeSingle();
  return NextResponse.json({ pin_set: Boolean(data?.pin_hash), pin_changed_at: data?.pin_changed_at ?? null, locked_until: data?.pin_locked_until ?? null });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login terlebih dahulu.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: 'Data keamanan tidak valid.' }, { status: 400 });
  const { action, pin, current_pin } = parsed.data;
  const admin = createAdminClient();
  const { data: existing } = await admin.from('user_transaction_security').select('pin_hash,pin_locked_until').eq('user_id', user.id).maybeSingle();

  if (action === 'status') return NextResponse.json({ pin_set: Boolean(existing?.pin_hash), locked_until: existing?.pin_locked_until ?? null });

  if (action === 'verify') {
    if (!pin) return NextResponse.json({ message: 'PIN wajib diisi.' }, { status: 400 });
    try { await verifyTransactionPin(user.id, pin); return NextResponse.json({ verified: true }); }
    catch (e: any) {
      const m = e?.message;
      if (m === 'PIN_NOT_SET') return NextResponse.json({ message: 'PIN transaksi belum dibuat.' }, { status: 409 });
      if (m === 'PIN_LOCKED') return NextResponse.json({ message: 'PIN terkunci sementara karena terlalu banyak percobaan gagal.' }, { status: 429 });
      return NextResponse.json({ message: 'PIN transaksi salah.' }, { status: 401 });
    }
  }

  if (!pin || !validateTransactionPin(pin)) return NextResponse.json({ message: 'PIN harus 6 digit dan tidak boleh terlalu mudah ditebak.' }, { status: 400 });
  if (action === 'change' && existing?.pin_hash) {
    if (!current_pin) return NextResponse.json({ message: 'PIN lama wajib diisi.' }, { status: 400 });
    try { await verifyTransactionPin(user.id, current_pin); }
    catch (e: any) {
      if (e?.message === 'PIN_LOCKED') return NextResponse.json({ message: 'PIN terkunci sementara.' }, { status: 429 });
      return NextResponse.json({ message: 'PIN lama salah.' }, { status: 401 });
    }
  }
  if (action === 'set' && existing?.pin_hash) return NextResponse.json({ message: 'PIN sudah dibuat. Gunakan ubah PIN.' }, { status: 409 });
  if (!['set','change'].includes(action)) return NextResponse.json({ message: 'Aksi tidak valid.' }, { status: 400 });

  const { error } = await admin.from('user_transaction_security').upsert({
    user_id: user.id,
    pin_hash: hashTransactionPin(pin),
    pin_failed_attempts: 0,
    pin_locked_until: null,
    pin_changed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ message: 'Gagal menyimpan PIN transaksi.' }, { status: 500 });
  return NextResponse.json({ message: action === 'set' ? 'PIN transaksi berhasil dibuat.' : 'PIN transaksi berhasil diubah.' });
}
