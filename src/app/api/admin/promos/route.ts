import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function admin() {
  const s = createClient();

  const {
    data: { user },
  } = await s.auth.getUser();

  if (!user) return null;

  const { data: p } = await s
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return p && ['ADMIN', 'SUPER_ADMIN'].includes(p.role) ? user : null;
}

export async function GET() {
  const user = await admin();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { data, error } = await createAdminClient()
    .from('promo_vouchers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    vouchers: data || [],
  });
}

export async function POST(req: Request) {
  const user = await admin();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const v = body?.value || {};

  const code = String(v.code || '')
    .trim()
    .toUpperCase();

  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return NextResponse.json(
      {
        message: 'Kode voucher 3-32 karakter.',
      },
      { status: 400 }
    );
  }

  const discountType = String(
    v.discount_type || 'FIXED'
  );

  const value = Math.round(
    Number(v.discount_value || 0)
  );

  if (
    !['FIXED', 'PERCENTAGE'].includes(discountType) ||
    value < 0 ||
    (discountType === 'PERCENTAGE' && value > 100)
  ) {
    return NextResponse.json(
      {
        message: 'Diskon tidak valid.',
      },
      { status: 400 }
    );
  }

  const payload = {
    code,
    name: String(v.name || code),
    discount_type: discountType,
    discount_value: value,

    min_order_amount: Math.max(
      0,
      Math.round(Number(v.min_order_amount || 0))
    ),

    max_discount:
      v.max_discount === '' || v.max_discount == null
        ? null
        : Math.max(
            0,
            Math.round(Number(v.max_discount))
          ),

    usage_limit:
      v.usage_limit === '' || v.usage_limit == null
        ? null
        : Math.max(
            1,
            Math.round(Number(v.usage_limit))
          ),

    usage_per_user: Math.max(
      1,
      Math.round(Number(v.usage_per_user || 1))
    ),

    starts_at:
      v.starts_at || new Date().toISOString(),

    expires_at: v.expires_at || null,

    is_active: v.is_active !== false,

    created_by: user.id,
  };

  const supabase = createAdminClient();

  let data;
  let error;

  /*
   * UPDATE
   * Jika voucher memiliki ID, kita update data yang sudah ada.
   */
  if (v.id) {
    const result = await supabase
      .from('promo_vouchers')
      .update(payload)
      .eq('id', v.id)
      .select('*')
      .single();

    data = result.data;
    error = result.error;
  }

  /*
   * INSERT
   * Jika tidak memiliki ID, buat voucher baru.
   */
  else {
    const result = await supabase
      .from('promo_vouchers')
      .insert(payload)
      .select('*')
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    return NextResponse.json(
      {
        message: error.message,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    voucher: data,
  });
}

export async function DELETE(req: Request) {
  const user = await admin();

  if (!user) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);

  if (!body?.id) {
    return NextResponse.json(
      {
        message: 'ID wajib.',
      },
      { status: 400 }
    );
  }

  const { error } = await createAdminClient()
    .from('promo_vouchers')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id);

  if (error) {
    return NextResponse.json(
      {
        message: error.message,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
  });
}