import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Security helpers for POST /api/revalidate (Juanpi). Kept free of Next imports so they can be unit-tested.
 */

/** Secrets shorter than this, or the .env.example placeholder, count as "not configured". */
export const MIN_SECRET_LENGTH = 16;
const PLACEHOLDERS = new Set(['change-me', 'changeme', 'secret']);

export function secretConfigured(secret: string | undefined): secret is string {
  return !!secret && secret.length >= MIN_SECRET_LENGTH && !PLACEHOLDERS.has(secret.toLowerCase());
}

/**
 * Constant-time comparison. Both sides are hashed first so the buffers always have the same
 * length (timingSafeEqual throws otherwise) and the time taken doesn't leak the secret's length.
 */
export function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Caller's IP as Vercel reports it (first hop of x-forwarded-for), or 'unknown'. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim() || 'unknown';
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Fixed-window counter per key, in memory.
 * On serverless each instance has its own memory, so this is a speed bump against brute force
 * and accidental loops (e.g. someone clicking "Publicar" repeatedly), not a global guarantee.
 */
export function createLimiter(opts: { limit: number; windowMs: number; maxKeys?: number; now?: () => number }) {
  const { limit, windowMs, maxKeys = 1000, now = Date.now } = opts;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  const prune = (t: number) => {
    for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
    // still too many keys (a flood of distinct IPs): drop the oldest entries
    while (buckets.size >= maxKeys) buckets.delete(buckets.keys().next().value!);
  };

  return {
    /** Seconds until the key may try again, or 0 if it is under the limit (does not count a hit). */
    retryAfter(key: string): number {
      const t = now();
      const b = buckets.get(key);
      if (!b || b.resetAt <= t || b.count < limit) return 0;
      return Math.ceil((b.resetAt - t) / 1000);
    },
    /** Count one hit for the key. */
    hit(key: string): void {
      const t = now();
      let b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        if (buckets.size >= maxKeys) prune(t);
        b = { count: 0, resetAt: t + windowMs };
        buckets.set(key, b);
      }
      b.count++;
    },
    size: () => buckets.size,
  };
}
