/**
 * POST /api/v1/payments — add payment to a charge
 *
 * If the payment does not cover the full remaining balance the server
 * automatically creates a "Saldo restante" charge for the difference and
 * marks the original charge as PAID in the same DB transaction.  This
 * makes partial-payment handling atomic and impossible to skip.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { created, handleApiError, NotFoundError, BadRequestError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const createSchema = z.object({
  chargeId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  method: z.enum(["PIX", "CASH", "CARD", "TRANSFER", "INSURANCE", "OTHER"]),
  paidAt: z.string().datetime().optional(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  /** Due date for the auto-created "Saldo restante" charge (ISO date string).
   *  Defaults to the original charge's dueDate, then to today. */
  remainderDueDate: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "payments:create");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = createSchema.parse(await req.json());

    // Verify charge belongs to tenant (quick check before transaction)
    const chargeCheck = await db.charge.findFirst({
      where: { id: body.chargeId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!chargeCheck) throw new NotFoundError("Charge");

    const { payment, remainderCharge } = await db.$transaction(async (tx) => {
      // Re-fetch charge inside transaction for consistency (prevents race conditions)
      const charge = await tx.charge.findFirst({
        where: { id: body.chargeId, tenantId: ctx.tenantId },
        include: { payments: true },
      });
      if (!charge) throw new NotFoundError("Charge");

      // Guard: charge must not already be fully paid or voided
      if (charge.status === "PAID" || charge.status === "VOID" || charge.status === "REFUNDED") {
        throw new BadRequestError(`Cannot add payment to a charge with status ${charge.status}.`);
      }

      // Guard: payment must not exceed the remaining balance
      const alreadyPaid = charge.payments.reduce((s, p) => s + p.amountCents, 0);
      const netAmount = charge.amountCents - charge.discountCents;
      const remaining = netAmount - alreadyPaid;
      if (body.amountCents > remaining) {
        throw new BadRequestError(
          `Valor do pagamento (R$ ${(body.amountCents / 100).toFixed(2)}) excede o saldo restante (R$ ${(remaining / 100).toFixed(2)}).`
        );
      }

      const totalPaid = alreadyPaid + body.amountCents;
      const isPartial = totalPaid < netAmount;
      const remainderCents = netAmount - totalPaid;

      // Determine due date for the remainder charge
      const remainderDueDate =
        body.remainderDueDate ??
        (charge.dueDate ? charge.dueDate.toISOString().substring(0, 10) : new Date().toISOString().substring(0, 10));

      // 1. Record the payment
      const pay = await tx.payment.create({
        data: {
          tenantId: ctx.tenantId,
          chargeId: body.chargeId,
          amountCents: body.amountCents,
          method: body.method,
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          reference: body.reference ?? null,
          notes: body.notes ?? null,
          createdById: ctx.userId,
        },
      });

      let remainder = null;

      if (isPartial) {
        // 2a. Partial payment — create remainder charge and close the original
        // @ts-ignore — stale Prisma client in VM; Vercel regenerates on deploy
        remainder = await (tx.charge as any).create({
          data: {
            tenantId: ctx.tenantId,
            patientId: charge.patientId,
            appointmentId: charge.appointmentId,
            providerUserId: charge.providerUserId,
            amountCents: remainderCents,
            discountCents: 0,
            description: "Saldo restante",
            dueDate: new Date(remainderDueDate),
            status: "PENDING",
          },
        });

        // 2b. Mark original charge as PAID — obligation transferred to remainder
        await tx.charge.update({
          where: { id: body.chargeId },
          data: { status: "PAID" },
        });
      } else {
        // 3. Full payment — mark charge as PAID
        await tx.charge.update({
          where: { id: body.chargeId },
          data: { status: "PAID" },
        });
      }

      return { payment: pay, remainderCharge: remainder };
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PAYMENT_CREATE",
      entity: "Payment",
      entityId: payment.id,
      summary: {
        chargeId: body.chargeId,
        amountCents: body.amountCents,
        method: body.method,
        remainderChargeId: remainderCharge?.id ?? null,
      },
      ipAddress,
      userAgent,
    });

    return created({ payment, remainderCharge });
  } catch (err) {
    return handleApiError(err);
  }
}
