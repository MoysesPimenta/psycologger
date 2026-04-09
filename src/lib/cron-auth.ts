/**
 * Shared cron-route authentication.
 *
 * Vercel Cron and any external scheduler must call protected
 * /api/v1/cron/* endpoints with `Authorization: Bearer <CRON_SECRET>`.
 *
 * The Bearer comparison MUST be timing-safe to avoid leaking the
 * secret one byte at a time via response-time differentials. Using a
 * naive `===` / `!==` against process.env.CRON_SECRET is exploitable in
 * theory and trivially fixed.
 *
 * Usage:
 *   import { requireCronAuth } from "@/lib/cron-auth";
 *   export async function GET(req: NextRequest) {
 *     const auth = requireCronAuth(req);
 *     if (auth) return auth; // 401/500 short-circuit
 *     // …actual cron work…
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

const TAG = "[cron-auth]";

/**
 * Returns null on success, or a NextResponse to short-circuit the
 * request on failure. Never throws.
 */
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(`${TAG} CRON_SECRET not set — rejecting request`);
    return NextResponse.json(
      { error: { code: "CRON_NOT_CONFIGURED", message: "Cron secret missing" } },
      { status: 500 },
    );
  }

  // Vercel Cron always sends this header. We do NOT *require* it
  // because some external schedulers won't, but it's a useful signal
  // and we log when it's absent in production for forensics.
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return unauthorized(isVercelCron, "missing bearer");
  }
  const provided = m[1];

  // Length check first; timingSafeEqual throws on mismatched lengths.
  // Pad both sides to a fixed length to keep the compare time
  // independent of the wrong-length case (32 is plenty for any
  // reasonable secret).
  const a = Buffer.alloc(64);
  const b = Buffer.alloc(64);
  Buffer.from(provided, "utf8").copy(a);
  Buffer.from(expected, "utf8").copy(b);
  // Always run the compare so timing doesn't depend on length match.
  const equal = timingSafeEqual(a, b) && provided.length === expected.length;
  if (!equal) {
    return unauthorized(isVercelCron, "bad bearer");
  }
  return null;
}

function unauthorized(isVercelCron: boolean, reason: string): NextResponse {
  // Always return the same generic body so an attacker cannot tell
  // which check failed.
  if (!isVercelCron) {
    console.warn(`${TAG} unauthorized cron call (${reason})`);
  }
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
    { status: 401 },
  );
}
