import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Sentry end-to-end verification endpoint.
 *
 * Protected by CRON_SECRET so it cannot be triggered by random visitors.
 * Usage:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://psycologger.vercel.app/api/debug/sentry-test
 *
 * Throws an unhandled error so Sentry's Next.js SDK captures it via the
 * route-handler instrumentation. Confirm the event lands in the Sentry
 * project (search "Psycologger Sentry e2e test"). If the event arrives with
 * a readable stack trace, source-map upload is also working.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  throw new Error(
    `Psycologger Sentry e2e test — triggered at ${new Date().toISOString()}`
  );
}
