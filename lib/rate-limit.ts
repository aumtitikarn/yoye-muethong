/**
 * Tiny in-memory fixed-window rate limiter. Good enough for a single-instance
 * deployment; swap for a shared store (Redis) if the app is scaled horizontally.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number
): { allowed: boolean } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= max) {
    return { allowed: false };
  }

  bucket.count += 1;
  return { allowed: true };
}

export function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
