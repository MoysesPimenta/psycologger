/**
 * GET  /api/v1/charges
 * POST /api/v1/charges
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma, ChargeStatus } from "@prisma/client";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { ok, created, handleApiError, parsePagination, buildMeta, NotFoundError, BadRequestError } from "@/lib/api";
import { requirePermission, ForbiddenError } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { sendPaymentCreatedNotification } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

const createSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  providerUserId: z.string().uuid().optional(),
  amountCents: z.number().int().positive().max(100_000_000), // max R$1,000,000.00
  discountCents: z.number().int().min(0).max(100_000_000).default(0),
  currency: z.string().length(3).default("BRL"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
    (d) => !isNaN(new Date(d).getTime()),
    "Data inválida"
  ),
  description: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "charges:view");
    requireTenant(ctx);

    const { searchParams } = new URL(req.url);
    const pagination = parsePagination(searchParams);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // When filtering for OVERDUE, also include PENDING charges past their due date
    // (a cron job may not have flipped their status yet).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const where: Prisma.ChargeWhereInput = {
      tenantId: ctx.tenantId,
      ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
      ...(status === "OVERDUE"
        ? {
            OR: [
              { status: "OVERDUE" as ChargeStatus },
              { status: "PENDING" as ChargeStatus, dueDate: { lt: today } },
            ],
          }
        : status
        ? { status: status as ChargeStatus }
        : {}),
      ...(patientId && { patientId }),
      ...((from || to) && {
        dueDate: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
    };

    const chargesQuery = db.charge.findMany({
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
    });
    const countQuery = db.charge.count({ where });

    const [charges, total] = await Promise.all([chargesQuery, countQuery]);

    // Compute paid amount for each charge
    const withPaid = charges.map((c) => ({
      ...c,
      paidAmountCents: c.payments.reduce((s: number, p: { amountCents: number }) => s + p.amountCents, 0),
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
    requireTenant(ctx);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Rate limit charges creation: 100 per hour per user
    const rl = await rateLimit(`charges:${ctx.userId}`, 100, 3600 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Limite de cobranças atingido. Tente novamente mais tarde." } },
        { status: 429 }
      );
    }

    const body = createSchema.parse(await req.json());

    // Determine providerUserId - default to current user if not specified
    const providerUserId = body.providerUserId ?? ctx.userId;

    // Privilege escalation check: PSYCHOLOGIST can only create charges for themselves
    if (ctx.role === "PSYCHOLOGIST" && providerUserId !== ctx.userId) {
      throw new ForbiddenError("Psicólogos só podem criar cobranças próprias");
    }

    // Validate patient belongs to this tenant
    const patient = await db.patient.findFirst({
      where: { id: body.patientId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundError("Patient");

    // Validate appointmentId belongs to this tenant
    if (body.appointmentId) {
      const appt = await db.appointment.findFirst({
        where: { id: body.appointmentId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!appt) throw new BadRequestError("Consulta não encontrada nesta clínica.");
    }

    // Validate sessionId belongs to this tenant
    if (body.sessionId) {
      const sess = await db.clinicalSession.findFirst({
        where: { id: body.sessionId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!sess) throw new BadRequestError("Sessão clínica não encontrada nesta clínica.");
    }

    // Validate discount doesn't exceed amount
    if (body.discountCents > body.amountCents) {
      throw new BadRequestError("Desconto não pode exceder o valor da cobrança.");
    }

    const charge = await db.charge.create({
      data: {
        tenantId: ctx.tenantId,
        patientId: body.patientId,
        appointmentId: body.appointmentId ?? null,
        sessionId: body.sessionId ?? null,
        providerUserId: providerUserId,
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

    // ─── Send payment created reminder (fire-and-forget) ─────────────
    try {
      const patient = await db.patient.findUnique({
        where: { id: body.patientId },
        select: { email: true, fullName: true },
      });
      const tenant = await db.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { name: true },
      });

      // Check if PAYMENT_CREATED template is active (default: yes)
      const template = await db.reminderTemplate.findFirst({
        where: { tenantId: ctx.tenantId, type: "PAYMENT_CREATED" },
      });
      const isActive = template ? template.isActive : true;

      if (patient?.email && tenant && isActive) {
        const net = body.amountCents - (body.discountCents ?? 0);
        const amountFormatted = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(net / 100);
        const dueDate = new Intl.DateTimeFormat("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(new Date(body.dueDate));

        await sendPaymentCreatedNotification({
          to: patient.email,
          patientName: patient.fullName,
          clinicName: tenant.name,
          amountFormatted,
          dueDate,
          description: body.description,
        });

        await db.paymentReminderLog.create({
          data: {
            tenantId: ctx.tenantId,
            chargeId: charge.id,
            type: "PAYMENT_CREATED",
            channel: "EMAIL",
            recipient: patient.email,
            status: "SENT",
          },
        });
      }
    } catch (emailErr) {
      // Don't fail charge creation if email fails — log and continue
      console.error("[charges] Payment reminder email failed:", emailErr);
    }

    return created(charge);
  } catch (err) {
    return handleApiError(err);
  }
}
