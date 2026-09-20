import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUser } from '@/lib/notification-engine';

export type RankingRow = {
  user_id: string;
  rank: number;
  successful_transactions: number;
  successful_amount: number;
};

/**
 * Rebuilds the ranking from COMPLETED orders only.
 * FAILED/CANCELLED/REFUNDED orders are intentionally excluded.
 * Returns users whose rank changed so the caller can process push notifications.
 */
export async function refreshUserRankings() {
  const admin = createAdminClient();

  const { data: totals, error: totalsError } = await admin
    .from('orders')
    .select('user_id,total_amount,status')
    .eq('status', 'COMPLETED');

  if (totalsError) throw totalsError;

  const aggregate = new Map<string, { count: number; amount: number }>();
  for (const row of totals || []) {
    const current = aggregate.get(row.user_id) || { count: 0, amount: 0 };
    current.count += 1;
    current.amount += Number(row.total_amount || 0);
    aggregate.set(row.user_id, current);
  }

  const ranked: RankingRow[] = [...aggregate.entries()]
    .map(([user_id, v]) => ({
      user_id,
      rank: 0,
      successful_transactions: v.count,
      successful_amount: v.amount,
    }))
    .sort((a, b) =>
      b.successful_transactions - a.successful_transactions ||
      b.successful_amount - a.successful_amount ||
      a.user_id.localeCompare(b.user_id)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const { data: previous, error: previousError } = await admin
    .from('user_rankings')
    .select('user_id,rank,successful_transactions,successful_amount');

  if (previousError) throw previousError;
  const previousMap = new Map((previous || []).map((r) => [r.user_id, r]));

  if (ranked.length) {
    const upserts = ranked.map((r) => ({
      user_id: r.user_id,
      rank: r.rank,
      successful_transactions: r.successful_transactions,
      successful_amount: r.successful_amount,
      previous_rank: previousMap.get(r.user_id)?.rank ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await admin
      .from('user_rankings')
      .upsert(upserts, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;
  }

  // Users with no completed transactions are not assigned a rank.
  const rankedIds = ranked.map((r) => r.user_id);
  if (previous?.length) {
    const staleIds = previous
      .filter((r) => !rankedIds.includes(r.user_id))
      .map((r) => r.user_id);
    if (staleIds.length) {
      await admin.from('user_rankings').delete().in('user_id', staleIds);
    }
  }

  const changes = ranked
    .map((r) => {
      const oldRank = previousMap.get(r.user_id)?.rank ?? null;
      if (oldRank === null || oldRank === r.rank) return null;
      return {
        ...r,
        previousRank: oldRank,
        movedBy: oldRank - r.rank,
      };
    })
    .filter(Boolean) as Array<RankingRow & { previousRank: number; movedBy: number }>;

  // First ranking notification + rank-change notifications.
  for (const row of ranked) {
    const old = previousMap.get(row.user_id)?.rank ?? null;
    if (old === null) {
      await notifyUser({
        userId: row.user_id,
        eventKey: 'RANKING_POSITION',
        variables: row as any,
        referenceType: 'user_ranking',
        referenceId: row.user_id,
        url: '/ranking',
      });
      continue;
    }

    if (old !== row.rank) {
      const eventKey = row.rank === old - 1 ? 'RANKING_UP_ONE' : 'RANKING_CHANGED';
      await notifyUser({
        userId: row.user_id,
        eventKey,
        variables: {
          ...row,
          previous_rank: old,
          moved_by: old - row.rank,
        },
        referenceType: 'user_ranking',
        referenceId: row.user_id,
        url: '/ranking',
      });
    }
  }

  return { ranked, changes };
}
