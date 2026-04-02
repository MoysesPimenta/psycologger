/**
 * Rate limiting — Upstash Redis in production, in-memory fallback for dev.
 *
 * Env vars (optional — falls back to in-memory if unset):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import { RATE_LIMIT_CLEANUP_INTERVAL_MS } from "@/lib/constants";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

// ─── In-memory fallback (single-instance only) ─────────────────────────────────

const memoryMap = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

function cleanupMemoryMap() {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  memoryMap.forEach((entry, key) => {
    if (entry.resetAt < now) memoryMap.delete(key);
  });
}

function memoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  cleanupMemoryMap();
  const now = Date.now();
  const entry = memoryMap.get(key);
  if (!entry || entry.resetAt < now) {
    memoryMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: limit - entry.count };
}

// ─── Upstash Redis rate limiting ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let upstashLimiter: any = null;
let upstashInitialized = false;

async function getUpstashLimiter(): Promise<unknown> {
  if (upstashInitialized) return upstashLimiter;
  upstashInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    // Dynamic require to avoid build errors when packages are not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Ratelimit } = require("@upstash/ratelimit");

    const redis = new Redis({ url, token });

    upstashLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      prefix: "psycologger:rl",
    });

    return upstashLimiter;
  } catch {
    // @upstash packages not installed — fall back to in-memory
    console.warn("[rate-limit] Upstash packages not available, using in-memory fallback");
    return null;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Rate limit a key. Uses Upstash Redis when configured, falls back to in-memory.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const limiter = await getUpstashLimiter();
  if (limiter) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (limiter as any).limit(key);
      return { allowed: result.success, remaining: result.remaining };
    } catch (err) {
      // If Upstash fails, fall back to in-memory rather than blocking the request
      console.error("[rate-limit] Upstash error, falling back to in-memory:", err);
    }
  }
  return memoryRateLimit(key, limit, windowMs);
}
