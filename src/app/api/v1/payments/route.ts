/**
 * POST /api/v1/payments — add payment to a charge
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { created, handleApiError, NotFoundError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const createSchema = z.object({
  chargeId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  method: z.enum(["PIX", "CASH", "CARD", "TRANSFER", "INSURANCE", "OTHER"]),
  paidAt: z.string().datetime().optional(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    requirePermission(ctx, "payments:create");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = createSchema.parse(await req.json());

    // Verify charge belongs to tenant
    const charge = await db.charge.findFirst({
      where: { id: body.chargeId, tenantId: ctx.tenantId },
      include: { payments: true },
    });
    if (!charge) throw new NotFoundError("Charge");

    const payment = await db.$transaction(async (tx) => {
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

      // Compute total paid
      const totalPaid =
        charge.payments.reduce((s, p) => s + p.amountCents, 0) + body.amountCents;
      const netAmount = charge.amountCents - charge.discountCents;

      if (totalPaid >= netAmount) {
        await tx.charge.update({
          where: { id: body.chargeId },
          data: { status: "PAID" },
        });
      }

      return pay;
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PAYMENT_CREATE",
      entity: "Payment",
      entityId: payment.id,
      summary: { chargeId: body.chargeId, amountCents: body.amountCents, method: body.method },
      ipAddress,
      userAgent,
    });

    return created(payment);
  } catch (err) {
    return handleApiError(err);
  }
}
