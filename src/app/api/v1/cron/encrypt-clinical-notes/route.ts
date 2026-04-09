/**
 * POST /api/v1/cron/encrypt-clinical-notes
 *
 * One-time (re-runnable) backfill that encrypts any legacy plaintext rows in
 * `ClinicalSession.noteText` and `SessionRevision.noteText`. Idempotent: rows
 * that already start with the `enc:v1:` sentinel are skipped.
 *
 * Protected by CRON_SECRET. Run manually after deploy:
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/v1/cron/encrypt-clinical-notes
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptNote, isEncryptedNote } from "@/lib/clinical-notes";
import { requireCronAuth } from "@/lib/cron-auth";

const BATCH_SIZE = 100;

export async function POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const stats = {
    sessions: { encrypted: 0, skipped: 0, errors: 0 },
    revisions: { encrypted: 0, skipped: 0, errors: 0 },
  };

  // ── ClinicalSession ──────────────────────────────────────────────────────
  let cursor: string | undefined;
  while (true) {
    const rows = await db.clinicalSession.findMany({
      select: { id: true, noteText: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.noteText || isEncryptedNote(row.noteText)) {
        stats.sessions.skipped++;
        continue;
      }
      try {
        const encrypted = await encryptNote(row.noteText);
        await db.clinicalSession.update({
          where: { id: row.id },
          data: { noteText: encrypted },
        });
        stats.sessions.encrypted++;
      } catch (err) {
        console.error(
          `[cron/encrypt-clinical-notes] session ${row.id} failed:`,
          err instanceof Error ? err.message : "unknown",
        );
        stats.sessions.errors++;
      }
    }

    cursor = rows[rows.length - 1].id;
  }

  // ── SessionRevision ──────────────────────────────────────────────────────
  cursor = undefined;
  while (true) {
    const rows: { id: string; noteText: string | null }[] = await db.sessionRevision.findMany({
      select: { id: true, noteText: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.noteText || isEncryptedNote(row.noteText)) {
        stats.revisions.skipped++;
        continue;
      }
      try {
        const encrypted = await encryptNote(row.noteText);
        await db.sessionRevision.update({
          where: { id: row.id },
          data: { noteText: encrypted },
        });
        stats.revisions.encrypted++;
      } catch (err) {
        console.error(
          `[cron/encrypt-clinical-notes] revision ${row.id} failed:`,
          err instanceof Error ? err.message : "unknown",
        );
        stats.revisions.errors++;
      }
    }

    cursor = rows[rows.length - 1].id;
  }

  return NextResponse.json({
    ok: true,
    ...stats,
    timestamp: new Date().toISOString(),
  });
}
