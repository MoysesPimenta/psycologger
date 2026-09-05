/**
 * Rate limiting — Upstash Redis when configured, Postgres as a distributed
 * fallback, in-memory only as a last resort in development.
 *
 * The Postgres fallback exists because an unreachable Redis used to fail closed
 * in production, which took down every rate-limited write in the app (patients,
 * appointments, sessions, charges, onboarding, invites). Postgres is already a
 * hard dependency of every request, and its counters are shared across all
 * serverless instances, so the limiter stays effective instead of degrading to
 * a per-instance counter or denying everything.
 *
 * Env vars (optional — falls back to Postgres if unset):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import { createHash } from "crypto";
import { RATE_LIMIT_CLEANUP_INTERVAL_MS } from "@/lib/constants";
import { db } from "@/lib/db";

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

// ─── Postgres distributed fallback ─────────────────────────────────────────────

let lastPgCleanup = 0;

/**
 * Hash the limiter key before persisting it. Rate-limit keys embed emails, IP
 * addresses and tenant/user ids; hashing keeps that out of the database while
 * preserving the uniqueness the counter needs. The limit/window are folded in
 * so two different limiter configs never share a counter row.
 */
function hashKey(key: string, limit: number, windowMs: number): string {
  return createHash("sha256").update(`${limit}:${windowMs}:${key}`).digest("hex");
}

/**
 * Fixed-window counter backed by Postgres. Returns null when the store itself
 * fails, so the caller can decide how to degrade.
 */
async function postgresRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  try {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const expiresAt = new Date(windowStart.getTime() + windowMs);
    const hashed = hashKey(key, limit, windowMs);

    // Single atomic statement: the upsert increments under the primary key, so
    // concurrent lambdas cannot race past the limit.
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitCounter" ("key", "windowStart", "count", "expiresAt")
      VALUES (${hashed}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
      RETURNING "count"
    `;
    const count = Number(rows[0]?.count ?? 1);

    // Opportunistic garbage collection of elapsed windows.
    if (now - lastPgCleanup > RATE_LIMIT_CLEANUP_INTERVAL_MS) {
      lastPgCleanup = now;
      void db
        .$executeRaw`DELETE FROM "RateLimitCounter" WHERE "expiresAt" < NOW()`
        .catch(() => {
          /* best effort — a failed sweep must never block a request */
        });
    }

    if (count > limit) {
      console.warn(JSON.stringify({ evt: "rate_limit_denied", store: "postgres", limit, windowMs }));
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: limit - count };
  } catch (err) {
    console.error("[rate-limit] Postgres fallback error:", err);
    return null;
  }
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
 * Rate limit a key. Uses Upstash Redis when configured, falls back to Postgres.
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
      // Do NOT fail closed here — an unreachable Redis must not take down every
      // write in the app. Fall through to the Postgres counter, which is still
      // shared across instances.
      console.error("[rate-limit] Upstash error, falling back to Postgres:", err);
    }
  }

  const pg = await postgresRateLimit(key, limit, windowMs);
  if (pg) return pg;

  if (process.env.NODE_ENV === "production") {
    // Both shared stores are unavailable. An in-memory counter is per-instance
    // and would silently defeat the limiter, so deny instead.
    console.error("[rate-limit] No shared store available — denying request");
    return { allowed: false, remaining: 0 };
  }
  return memoryRateLimit(key, limit, windowMs);
}
