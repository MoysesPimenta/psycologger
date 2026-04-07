/**
 * POST /api/v1/cron/payment-reminders
 *
 * Called daily (e.g. via Vercel Cron at 9 AM BRT) to send:
 * 1. 24-hour reminders for charges due tomorrow
 * 2. Overdue notifications for charges that became overdue today
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  sendPaymentDueReminder,
  sendPaymentOverdueNotification,
} from "@/lib/email";

import { formatCurrencyPlain, formatDatePlain } from "@/lib/utils";

const CRON_SECRET = process.env.CRON_SECRET;

// eslint-disable-next-line @typescript-eslint/no-explicit-any

interface ChargeWithRelations {
  id: string;
  tenantId: string;
  amountCents: number;
  discountCents: number;
  dueDate: Date;
  status: string;
  patient: { id: string; fullName: string; email: string | null };
  tenant: { id: string; name: string };
}

async function hasReminderBeenSent(chargeId: string, type: string, tenantId: string): Promise<boolean> {
  const count = await db.paymentReminderLog.count({
    where: { chargeId, type: type as "PAYMENT_CREATED" | "PAYMENT_DUE_24H" | "PAYMENT_OVERDUE", tenantId },
  });
  return count > 0;
}

async function logReminder(data: {
  tenantId: string;
  chargeId: string;
  type: "PAYMENT_CREATED" | "PAYMENT_DUE_24H" | "PAYMENT_OVERDUE";
  recipient: string;
  status: "SENT" | "FAILED" | "BOUNCED";
  errorMsg?: string;
}) {
  await db.paymentReminderLog.create({
    data: {
      tenantId: data.tenantId,
      chargeId: data.chargeId,
      type: data.type,
      channel: "EMAIL",
      recipient: data.recipient,
      status: data.status,
      errorMsg: data.errorMsg ?? null,
    },
  });
}

export async function POST(req: NextRequest) {
  // Verify cron secret — MUST be set in production; reject if missing or mismatched
  const authHeader = req.headers.get("authorization");
  if (!CRON_SECRET) {
    console.error("[cron/payment-reminders] CRON_SECRET env var is not set — rejecting request");
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    console.warn("[cron/payment-reminders] Invalid authorization header — rejecting request");
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const now = new Date();
  // Use UTC dates to avoid timezone ambiguity — dueDate is stored as @db.Date (UTC midnight)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);

  let sentCount = 0;
  let errorCount = 0;

  // ─── 1. Due tomorrow (24h reminder) ─────────────────────────────────────

  const chargesDueTomorrow = (await db.charge.findMany({
    where: {
      status: { in: ["PENDING"] },
      dueDate: { gte: tomorrow, lt: dayAfterTomorrow },
    },
    include: {
      patient: { select: { id: true, fullName: true, email: true } },
      tenant: { select: { id: true, name: true } },
    },
  })) as unknown as ChargeWithRelations[];

  // Batch-fetch sent logs for these charges
  const sentLogs24h = await db.paymentReminderLog.findMany({
    where: {
      chargeId: { in: chargesDueTomorrow.map((c) => c.id) },
      type: "PAYMENT_DUE_24H",
    },
    select: { chargeId: true },
  });
  const sentSet24h = new Set(sentLogs24h.map((l) => l.chargeId));

  // Batch-fetch templates for these tenants
  const tenantIds24h = Array.from(new Set(chargesDueTomorrow.map((c) => c.tenantId)));
  const templates24h = await db.reminderTemplate.findMany({
    where: { tenantId: { in: tenantIds24h }, type: "PAYMENT_DUE_24H" },
  });
  const templatesByTenant24h = new Map(templates24h.map((t) => [t.tenantId, t]));

  for (const charge of chargesDueTomorrow) {
    if (!charge.patient.email) continue;
    if (sentSet24h.has(charge.id)) continue;

    // Check if tenant has this template active (default: yes)
    const template = templatesByTenant24h.get(charge.tenantId);
    if (template && !template.isActive) continue;

    const net = charge.amountCents - charge.discountCents;

    try {
      await sendPaymentDueReminder({
        to: charge.patient.email,
        patientName: charge.patient.fullName,
        clinicName: charge.tenant.name,
        amountFormatted: formatCurrencyPlain(net),
        dueDate: formatDatePlain(charge.dueDate),
      });

      await logReminder({
        tenantId: charge.tenantId,
        chargeId: charge.id,
        type: "PAYMENT_DUE_24H",
        recipient: charge.patient.email,
        status: "SENT",
      });
      sentCount++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await logReminder({
        tenantId: charge.tenantId,
        chargeId: charge.id,
        type: "PAYMENT_DUE_24H",
        recipient: charge.patient.email,
        status: "FAILED",
        errorMsg,
      });
      errorCount++;
    }
  }

  // ─── 2. Overdue today ──────────────────────────────────────────────────

  const chargesOverdue = (await db.charge.findMany({
    where: {
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lt: today },
    },
    include: {
      patient: { select: { id: true, fullName: true, email: true } },
      tenant: { select: { id: true, name: true } },
    },
  })) as unknown as ChargeWithRelations[];

  // Batch-fetch sent logs for overdue charges
  const sentLogsOverdue = await db.paymentReminderLog.findMany({
    where: {
      chargeId: { in: chargesOverdue.map((c) => c.id) },
      type: "PAYMENT_OVERDUE",
    },
    select: { chargeId: true },
  });
  const sentSetOverdue = new Set(sentLogsOverdue.map((l) => l.chargeId));

  // Batch-fetch templates for these tenants
  const tenantIdsOverdue = Array.from(new Set(chargesOverdue.map((c) => c.tenantId)));
  const templatesOverdue = await db.reminderTemplate.findMany({
    where: { tenantId: { in: tenantIdsOverdue }, type: "PAYMENT_OVERDUE" },
  });
  const templatesByTenantOverdue = new Map(templatesOverdue.map((t) => [t.tenantId, t]));

  for (const charge of chargesOverdue) {
    if (!charge.patient.email) continue;
    if (sentSetOverdue.has(charge.id)) continue;

    const template = templatesByTenantOverdue.get(charge.tenantId);
    if (template && !template.isActive) continue;

    const net = charge.amountCents - charge.discountCents;

    try {
      await sendPaymentOverdueNotification({
        to: charge.patient.email,
        patientName: charge.patient.fullName,
        clinicName: charge.tenant.name,
        amountFormatted: formatCurrencyPlain(net),
        dueDate: formatDatePlain(charge.dueDate),
      });

      // Also flip status to OVERDUE if still PENDING
      if (charge.status === "PENDING") {
        await db.charge.update({
          where: { id: charge.id },
          data: { status: "OVERDUE" },
        });
      }

      await logReminder({
        tenantId: charge.tenantId,
        chargeId: charge.id,
        type: "PAYMENT_OVERDUE",
        recipient: charge.patient.email,
        status: "SENT",
      });
      sentCount++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      await logReminder({
        tenantId: charge.tenantId,
        chargeId: charge.id,
        type: "PAYMENT_OVERDUE",
        recipient: charge.patient.email,
        status: "FAILED",
        errorMsg,
      });
      errorCount++;
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sentCount,
    errors: errorCount,
    timestamp: now.toISOString(),
  });
}
