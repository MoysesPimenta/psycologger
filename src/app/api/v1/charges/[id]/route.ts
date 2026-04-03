/**
 * PATCH  /api/v1/charges/[id] — edit amount or discount
 * DELETE /api/v1/charges/[id] — remove a charge (must be PENDING / no payments)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, noContent, handleApiError, NotFoundError, BadRequestError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const patchSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000).optional(),
  discountCents: z.number().int().min(0).max(100_000_000).optional(),
  description: z.string().max(500).optional().nullable(),
  dueDate: z.string().optional(),
  // Allow marking a partially-paid charge as PAID once a remainder charge is created.
  // Only PAID is accepted here — voiding uses DELETE, OVERDUE is set by a cron job.
  status: z.enum(["PAID"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "charges:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const charge = await db.charge.findFirst({
      where: { id: params.id, tenantId: ctx.tenantId },
    });
    if (!charge) throw new NotFoundError("Charge");

    const body = patchSchema.parse(await req.json());

    // Validate discount doesn't exceed amount
    const newAmount = body.amountCents ?? charge.amountCents;
    const newDiscount = body.discountCents ?? charge.discountCents;
    if (newDiscount > newAmount) {
      throw new BadRequestError("Discount cannot exceed the charge amount");
    }

    // Validate charge status transition
    if (body.status === "PAID") {
      if (charge.status !== "PENDING" && charge.status !== "OVERDUE") {
        throw new BadRequestError(`Não é possível alterar de ${charge.status} para PAID.`);
      }
      const paymentCount = await db.payment.count({ where: { chargeId: params.id } });
      if (paymentCount === 0) {
        throw new BadRequestError("Cannot mark a charge as PAID without any recorded payments.");
      }
    }

    const updated = await db.charge.update({
      where: { id: params.id, tenantId: ctx.tenantId },
      data: {
        ...(body.amountCents !== undefined && { amountCents: body.amountCents }),
        ...(body.discountCents !== undefined && { discountCents: body.discountCents }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.dueDate !== undefined && { dueDate: new Date(body.dueDate) }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "CHARGE_UPDATE",
      entity: "Charge",
      entityId: params.id,
      summary: { fields: Object.keys(body), patientId: charge.patientId },
      ipAddress,
      userAgent,
    });

    return ok(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "charges:void");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const charge = await db.charge.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
        // PSYCHOLOGIST can only void their own charges
        ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      },
      include: { payments: { select: { id: true } } },
    });
    if (!charge) throw new NotFoundError("Charge");

    // Block deletion if there are already recorded payments
    if (charge.payments.length > 0) {
      throw new BadRequestError("Cannot delete a charge that has payments. Void it instead.");
    }

    await db.charge.delete({ where: { id: params.id, tenantId: ctx.tenantId } });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "CHARGE_DELETE",
      entity: "Charge",
      entityId: params.id,
      summary: { patientId: charge.patientId, amountCents: charge.amountCents },
      ipAddress,
      userAgent,
    });

    return noContent();
  } catch (err) {
    return handleApiError(err);
  }
}
