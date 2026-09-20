import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const email = String(body?.email || '')
      .trim()
      .toLowerCase();

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { message: 'Email tidak valid.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data, error } =
      await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (error) {
      console.error('check-email Supabase error:', error);

      return NextResponse.json(
        {
          message: 'Tidak dapat memeriksa email sekarang.',
        },
        { status: 500 }
      );
    }

    const exists = data.users.some(
      (user) =>
        user.email?.toLowerCase() === email
    );

    return NextResponse.json({
      exists,
    });
  } catch (error) {
    console.error('check-email error:', error);

    return NextResponse.json(
      {
        message: 'Terjadi kesalahan saat memeriksa email.',
      },
      { status: 500 }
    );
  }
}