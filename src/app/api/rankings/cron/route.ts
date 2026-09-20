import { NextResponse } from 'next/server';
import { refreshUserRankings } from '@/lib/ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  try {
    const result = await refreshUserRankings();
    return NextResponse.json({ ok: true, ranked: result.ranked.length, changes: result.changes.length, at: new Date().toISOString() });
  } catch (error) {
    console.error('RANKING CRON ERROR', error);
    return NextResponse.json({ ok: false, message: 'Ranking gagal diperbarui.' }, { status: 500 });
  }
}
