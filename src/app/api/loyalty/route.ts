import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: 'Silakan login.' }, { status: 401 });

  const { data, error } = await supabase.rpc('get_my_loyalty_summary');
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  const summary = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    points: Number(summary?.points ?? 0),
    lifetime_points: Number(summary?.lifetime_points ?? 0),
    level_name: summary?.level_name ?? 'Bronze',
    multiplier: Number(summary?.multiplier ?? 1),
  });
}
