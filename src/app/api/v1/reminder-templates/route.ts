/**
 * GET   /api/v1/reminder-templates  — list templates for the tenant
 * POST  /api/v1/reminder-templates  — create or update a template by type
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const saveSchema = z.object({
  type: z.enum([
    "CONFIRMATION",
    "REMINDER_24H",
    "REMINDER_1H",
    "PAYMENT_CREATED",
    "PAYMENT_DUE_24H",
    "PAYMENT_OVERDUE",
  ]),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:view");

    const templates = await db.reminderTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { type: "asc" },
    });

    return ok(templates);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "tenant:edit");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = saveSchema.parse(await req.json());

    // Each tenant has at most one template per type — create or update
    const existing = await db.reminderTemplate.findFirst({
      where: { tenantId: ctx.tenantId, type: body.type },
    });

    let template;
    if (existing) {
      template = await db.reminderTemplate.update({
        where: { id: existing.id },
        data: { subject: body.subject, body: body.body, isActive: body.isActive },
      });
    } else {
      template = await db.reminderTemplate.create({
        data: {
          tenantId: ctx.tenantId,
          type: body.type,
          subject: body.subject,
          body: body.body,
          isActive: body.isActive,
        },
      });
    }

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "REMINDER_TEMPLATE_SAVE",
      entity: "ReminderTemplate",
      entityId: template.id,
      summary: { type: body.type },
      ipAddress,
      userAgent,
    });

    return created(template);
  } catch (err) {
    return handleApiError(err);
  }
}
