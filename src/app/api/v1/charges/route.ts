/**
 * GET  /api/v1/charges
 * POST /api/v1/charges
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, parsePagination, buildMeta } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const createSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  amountCents: z.number().int().positive(),
  discountCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("BRL"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "charges:view");

    const { searchParams } = new URL(req.url);
    const pagination = parsePagination(searchParams);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where = {
      tenantId: ctx.tenantId,
      ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      ...(status && { status: status as never }),
      ...(patientId && { patientId }),
      ...(from && { dueDate: { gte: new Date(from) } }),
      ...(to && { dueDate: { lte: new Date(to) } }),
    };

    const [charges, total] = await Promise.all([
      db.charge.findMany({
        where,
        include: {
          patient: { select: { id: true, fullName: true } },
          provider: { select: { id: true, name: true } },
          payments: {
            select: { id: true, amountCents: true, method: true, paidAt: true },
          },
        },
        orderBy: { dueDate: "desc" },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      db.charge.count({ where }),
    ]);

    // Compute paid amount for each charge
    const withPaid = charges.map((c) => ({
      ...c,
      paidAmountCents: c.payments.reduce((s, p) => s + p.amountCents, 0),
    }));

    return ok(withPaid, buildMeta(total, pagination));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "charges:create");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = createSchema.parse(await req.json());

    const charge = await db.charge.create({
      data: {
        tenantId: ctx.tenantId,
        patientId: body.patientId,
        appointmentId: body.appointmentId ?? null,
        sessionId: body.sessionId ?? null,
        providerUserId: ctx.userId,
        amountCents: body.amountCents,
        discountCents: body.discountCents,
        currency: body.currency,
        dueDate: new Date(body.dueDate),
        description: body.description ?? null,
        notes: body.notes ?? null,
        status: "PENDING",
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "CHARGE_CREATE",
      entity: "Charge",
      entityId: charge.id,
      summary: { patientId: body.patientId, amountCents: body.amountCents },
      ipAddress,
      userAgent,
    });

    return created(charge);
  } catch (err) {
    return handleApiError(err);
  }
}
