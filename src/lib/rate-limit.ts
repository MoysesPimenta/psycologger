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
let upstashRedis: any = null;
let upstashInitialized = false;
let Ratelimit: any = null;

// Cache limiters by config key: "limit:windowMs"
const upstashLimiters = new Map<string, any>();

async function initializeUpstash(): Promise<boolean> {
  if (upstashInitialized) return !!upstashRedis;
  upstashInitialized = true;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    // Dynamic require to avoid build errors when packages are not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RatelimitModule = require("@upstash/ratelimit");
    Ratelimit = RatelimitModule.Ratelimit;

    upstashRedis = new Redis({ url, token });
    return true;
  } catch {
    // @upstash packages not installed — fall back to in-memory
    console.warn("[rate-limit] Upstash packages not available, using in-memory fallback");
    return false;
  }
}

async function getUpstashLimiter(limit: number, windowMs: number): Promise<unknown> {
  const hasUpstash = await initializeUpstash();
  if (!hasUpstash || !upstashRedis || !Ratelimit) return null;

  const cacheKey = `${limit}:${windowMs}`;
  if (upstashLimiters.has(cacheKey)) {
    return upstashLimiters.get(cacheKey);
  }

  try {
    const windowSeconds = Math.ceil(windowMs / 1000);
    const limiter = new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: `psycologger:rl:${limit}:${windowSeconds}`,
    });
    upstashLimiters.set(cacheKey, limiter);
    return limiter;
  } catch (err) {
    console.error("[rate-limit] Failed to create Upstash limiter:", err);
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
  const limiter = await getUpstashLimiter(limit, windowMs);
  if (limiter) {
    try {
      // Upstash Ratelimit is dynamically imported; cast is necessary to call its methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (limiter as any).limit(key);
      if (!result.success) {
        // Structured log for Vercel log drain / Sentry to aggregate 429s.
        console.warn(JSON.stringify({
          evt: "rate_limit_denied",
          key,
          limit,
          windowMs,
          reset: result.reset,
        }));
      }
      return { allowed: result.success, remaining: result.remaining };
    } catch (err) {
      console.error("[rate-limit] Upstash error:", err);
      // In production, fail closed instead of silently degrading to a
      // per-instance in-memory counter that defeats the limiter on Vercel.
      if (process.env.NODE_ENV === "production") {
        return { allowed: false, remaining: 0 };
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    // env-check should already have prevented boot, but defense-in-depth.
    console.error("[rate-limit] Upstash not configured in production — denying request");
    return { allowed: false, remaining: 0 };
  }
  return memoryRateLimit(key, limit, windowMs);
}
