/**
 * POST /api/v1/cron/encrypt-cpfs
 *
 * One-time migration endpoint to encrypt existing plaintext CPF values.
 * Safe to run multiple times (idempotent — skips already-encrypted values).
 *
 * Protected by CRON_SECRET header. Run manually or via cron once after deployment.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptCpf, isCpfEncrypted } from "@/lib/cpf-crypto";

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 100;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET) {
    console.error("[cron/encrypt-cpfs] CRON_SECRET not set");
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let encrypted = 0;
  let skipped = 0;
  let errors = 0;
  let cursor: string | undefined;

  // Process in batches to avoid memory issues
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const patients = await db.patient.findMany({
      where: { cpf: { not: null } },
      select: { id: true, cpf: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });

    if (patients.length === 0) break;

    for (const patient of patients) {
      if (!patient.cpf || isCpfEncrypted(patient.cpf)) {
        skipped++;
        continue;
      }

      try {
        const encryptedCpf = await encryptCpf(patient.cpf);
        await db.patient.update({
          where: { id: patient.id },
          data: { cpf: encryptedCpf },
        });
        encrypted++;
      } catch (err) {
        console.error(`[cron/encrypt-cpfs] Failed to encrypt CPF for patient ${patient.id}:`,
          err instanceof Error ? err.message : "Unknown error");
        errors++;
      }
    }

    cursor = patients[patients.length - 1].id;
  }

  return NextResponse.json({
    ok: true,
    encrypted,
    skipped,
    errors,
    timestamp: new Date().toISOString(),
  });
}
