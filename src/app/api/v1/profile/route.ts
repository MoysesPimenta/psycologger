/**
 * GET  /api/v1/profile — get the current user's profile
 * PATCH /api/v1/profile — update name, phone
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError, NotFoundError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);

    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, name: true, email: true, phone: true, imageUrl: true, createdAt: true },
    });
    if (!user) throw new NotFoundError("User");

    return ok(user);
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(100).optional(),
  // @ts-ignore — phone added via migration, Prisma types updated on next generate
  phone: z.string().max(30).optional().nullable(),
});

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = patchSchema.parse(await req.json());

    const updated = await db.user.update({
      where: { id: ctx.userId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        // @ts-ignore — phone field added via migration
        ...(body.phone !== undefined && { phone: body.phone }),
      },
      select: { id: true, name: true, email: true, phone: true },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "USER_PROFILE_UPDATE",
      entity: "User",
      entityId: ctx.userId,
      summary: { fields: Object.keys(body) },
      ipAddress,
      userAgent,
    });

    return ok(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
