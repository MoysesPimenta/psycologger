/**
 * POST /api/v1/cron/soft-delete-gc
 *
 * Daily hard-delete job. Permanently removes records that were soft-deleted
 * more than SOFT_DELETE_RETENTION_MS ago. Covers:
 *   - ClinicalSession
 *   - FileObject
 *   - JournalEntry
 *   - JournalNote
 *
 * LGPD/GDPR compliance: honours 30-day retention then purges.
 * Protected by CRON_SECRET header. Idempotent.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SOFT_DELETE_RETENTION_MS } from "@/lib/constants";
import { requireCronAuth } from "@/lib/cron-auth";

export async function POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const cutoff = new Date(Date.now() - SOFT_DELETE_RETENTION_MS);
  const results: Record<string, number> = {};

  try {
    const cs = await db.clinicalSession.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    results.clinicalSession = cs.count;

    const fo = await db.fileObject.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    results.fileObject = fo.count;

    const je = await db.journalEntry.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    results.journalEntry = je.count;

    const jn = await db.journalNote.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
    results.journalNote = jn.count;
  } catch (err) {
    console.error("[cron/soft-delete-gc] Error during purge:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }

  console.log(JSON.stringify({ evt: "soft_delete_gc", cutoff: cutoff.toISOString(), ...results }));
  return NextResponse.json({ ok: true, cutoff: cutoff.toISOString(), purged: results });
}
