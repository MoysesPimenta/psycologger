/**
 * POST /api/v1/cron/encrypt-patient-notes
 *
 * One-time (re-runnable) backfill that encrypts any legacy plaintext rows in
 * `Patient.notes`. Idempotent: rows that already start with the `enc:v1:`
 * sentinel are skipped.
 *
 * Protected by CRON_SECRET. Run manually after deploy:
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" \
 *     https://<host>/api/v1/cron/encrypt-patient-notes
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptPatientNotes, isEncryptedPatientNotes } from "@/lib/patient-notes";
import { requireCronAuth } from "@/lib/cron-auth";

const BATCH_SIZE = 100;

export async function POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const stats = {
    encrypted: 0,
    skipped: 0,
    errors: 0,
  };

  // ── Patient ──────────────────────────────────────────────────────────────
  let cursor: string | undefined;
  while (true) {
    const rows = await db.patient.findMany({
      select: { id: true, notes: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.notes || isEncryptedPatientNotes(row.notes)) {
        stats.skipped++;
        continue;
      }
      try {
        const encrypted = await encryptPatientNotes(row.notes);
        await db.patient.update({
          where: { id: row.id },
          data: { notes: encrypted },
        });
        stats.encrypted++;
      } catch (err) {
        console.error(
          `[cron/encrypt-patient-notes] patient ${row.id} failed:`,
          err instanceof Error ? err.message : "unknown",
        );
        stats.errors++;
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
