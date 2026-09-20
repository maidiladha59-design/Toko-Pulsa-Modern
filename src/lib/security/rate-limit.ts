import { createClient } from '@/lib/supabase/server';

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_key_hash: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || !data?.[0]) {
    // Fail closed for sensitive operations when the rate-limit store is unavailable.
    return { allowed: false, remaining: 0, retryAfter: 60 };
  }
  return {
    allowed: Boolean(data[0].allowed),
    remaining: Number(data[0].remaining || 0),
    retryAfter: Number(data[0].retry_after || 0),
  };
}

export async function requireRateLimit(key: string, limit: number, windowSeconds: number) {
  const result = await consumeRateLimit(key, limit, windowSeconds);
  if (!result.allowed) {
    const error = new Error('RATE_LIMITED');
    (error as any).retryAfter = result.retryAfter;
    throw error;
  }
  return result;
}
