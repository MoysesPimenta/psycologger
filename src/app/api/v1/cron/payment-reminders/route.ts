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

const CRON_SECRET = process.env.CRON_SECRET;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any;

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

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

async function hasReminderBeenSent(chargeId: string, type: string): Promise<boolean> {
  const count = await dbAny.paymentReminderLog.count({
    where: { chargeId, type },
  });
  return count > 0;
}

async function logReminder(data: {
  tenantId: string;
  chargeId: string;
  type: string;
  recipient: string;
  status: string;
  errorMsg?: string;
}) {
  await dbAny.paymentReminderLog.create({
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
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  let sentCount = 0;
  let errorCount = 0;

  // ─── 1. Due tomorrow (24h reminder) ─────────────────────────────────────

  const chargesDueTomorrow = await db.charge.findMany({
    where: {
      status: { in: ["PENDING" as never] },
      dueDate: { gte: tomorrow, lt: dayAfterTomorrow },
    },
    include: {
      patient: { select: { id: true, fullName: true, email: true } },
      tenant: { select: { id: true, name: true } },
    },
  } as never) as unknown as ChargeWithRelations[];

  for (const charge of chargesDueTomorrow) {
    if (!charge.patient.email) continue;
    if (await hasReminderBeenSent(charge.id, "PAYMENT_DUE_24H")) continue;

    // Check if tenant has this template active
    const template = await db.reminderTemplate.findFirst({
      where: { tenantId: charge.tenantId, type: "PAYMENT_DUE_24H" },
    });
    if (template && !template.isActive) continue;

    const net = charge.amountCents - charge.discountCents;

    try {
      await sendPaymentDueReminder({
        to: charge.patient.email,
        patientName: charge.patient.fullName,
        clinicName: charge.tenant.name,
        amountFormatted: formatCurrency(net),
        dueDate: formatDate(charge.dueDate),
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

  const chargesOverdue = await db.charge.findMany({
    where: {
      status: { in: ["PENDING" as never, "OVERDUE" as never] },
      dueDate: { lt: today },
    },
    include: {
      patient: { select: { id: true, fullName: true, email: true } },
      tenant: { select: { id: true, name: true } },
    },
  } as never) as unknown as ChargeWithRelations[];

  for (const charge of chargesOverdue) {
    if (!charge.patient.email) continue;
    if (await hasReminderBeenSent(charge.id, "PAYMENT_OVERDUE")) continue;

    const template = await db.reminderTemplate.findFirst({
      where: { tenantId: charge.tenantId, type: "PAYMENT_OVERDUE" },
    });
    if (template && !template.isActive) continue;

    const net = charge.amountCents - charge.discountCents;

    try {
      await sendPaymentOverdueNotification({
        to: charge.patient.email,
        patientName: charge.patient.fullName,
        clinicName: charge.tenant.name,
        amountFormatted: formatCurrency(net),
        dueDate: formatDate(charge.dueDate),
      });

      // Also flip status to OVERDUE if still PENDING
      if (charge.status === "PENDING") {
        await db.charge.update({
          where: { id: charge.id },
          data: { status: "OVERDUE" as never },
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
