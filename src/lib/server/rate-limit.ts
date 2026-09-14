interface RateLimitBucket {
  count: number;
  resetAt: number;
}

// Best-effort, process-local protection. It intentionally stores no network
// identifiers and is complemented by database uniqueness constraints.
const buckets = new Map<string, RateLimitBucket>();

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 2_000) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
    }
    return true;
  }

  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}
