/**
 * POST /api/v1/cron/staging-keepalive
 *
 * Weekly ping to the staging Supabase project so it doesn't auto-pause
 * after 7 days of inactivity (free-tier limitation).
 *
 * Runs from PROD app context (so it never gets paused itself).
 * Connects to staging via STAGING_DATABASE_URL env var, runs SELECT 1,
 * disconnects. Protected by CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const CRON_SECRET = process.env.CRON_SECRET;
const STAGING_DATABASE_URL = process.env.STAGING_DATABASE_URL;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET) {
    console.error("[cron/staging-keepalive] CRON_SECRET not set — rejecting");
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    console.warn("[cron/staging-keepalive] Invalid authorization header");
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!STAGING_DATABASE_URL) {
    console.warn(JSON.stringify({ evt: "staging_keepalive_skipped", reason: "no_url" }));
    return NextResponse.json({ ok: true, skipped: true, reason: "STAGING_DATABASE_URL unset" });
  }

  const client = new PrismaClient({
    datasources: { db: { url: STAGING_DATABASE_URL } },
  });

  try {
    const rows = await client.$queryRawUnsafe<Array<{ ok: number }>>("SELECT 1 as ok");
    console.log(JSON.stringify({ evt: "staging_keepalive_ok", rows: rows.length }));
    return NextResponse.json({ ok: true, pinged: true });
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "staging_keepalive_failed",
        error: err instanceof Error ? err.message : "unknown",
      }),
    );
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  } finally {
    await client.$disconnect();
  }
}
