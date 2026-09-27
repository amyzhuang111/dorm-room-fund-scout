// Per-process sliding window. On Vercel this limits one server instance;
// it is not a global counter across every lambda.

export interface RateLimitOk {
  ok: true;
}

export interface RateLimitNo {
  ok: false;
  retryAfterSeconds: number;
}

export function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, number[]>();
  return function allow(key: string, now = Date.now()): RateLimitOk | RateLimitNo {
    const prev = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
    if (prev.length >= limit) {
      const oldest = prev[0] ?? now;
      buckets.set(key, prev);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
    }
    prev.push(now);
    buckets.set(key, prev);
    return { ok: true };
  };
}
