/**
 * In-memory rate limiter for Cloudflare Workers.
 * Resets on worker restart (acceptable for Workers architecture).
 */

import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  // Clean expired entries (max 100 per check to avoid blocking)
  let cleaned = 0;
  for (const [k, v] of store) {
    if (v.resetAt <= now) { store.delete(k); cleaned++; }
    if (cleaned >= 100) break;
  }

  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

export function rateLimitMiddleware(limit = 100, windowMs = 60_000) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
    const { allowed, remaining, resetAt } = checkRateLimit(ip, limit, windowMs);

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));

    if (!allowed) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too many requests', retry_after: retryAfter }, 429);
    }

    await next();
  };
}
