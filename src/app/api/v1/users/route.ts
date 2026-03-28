/**
 * GET  /api/v1/users — list tenant members
 * POST /api/v1/users/invite — invite a user
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, apiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { sendInviteEmail } from "@/lib/email";
import { auditLog, extractRequestMeta } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "users:view");

    const members = await db.membership.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        user: {
          select: { id: true, name: true, email: true, lastLoginAt: true, imageUrl: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return ok(members);
  } catch (err) {
    return handleApiError(err);
  }
}

const inviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(["TENANT_ADMIN", "PSYCHOLOGIST", "ASSISTANT", "READONLY"]),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "users:invite");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = inviteSchema.parse(await req.json());

    // Check if already a member
    const existingMembership = await db.membership.findFirst({
      where: {
        tenantId: ctx.tenantId,
        user: { email: body.email },
      },
    });
    if (existingMembership) {
      return apiError("CONFLICT", "Este usuário já é membro desta clínica.", 409);
    }

    const tenant = await db.tenant.findUnique({ where: { id: ctx.tenantId } });
    const inviter = await db.user.findUnique({ where: { id: ctx.userId } });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await db.invite.create({
      data: {
        tenantId: ctx.tenantId,
        email: body.email,
        role: body.role,
        expiresAt,
        sentById: ctx.userId,
      },
    });

    const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/${invite.token}`;

    await sendInviteEmail({
      to: body.email,
      inviteUrl,
      tenantName: tenant?.name ?? "Psycologger",
      role: body.role,
      inviterName: inviter?.name ?? undefined,
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "USER_INVITE",
      entity: "Invite",
      entityId: invite.id,
      summary: { role: body.role },
      ipAddress,
      userAgent,
    });

    return created({ id: invite.id, email: body.email, role: body.role, expiresAt });
  } catch (err) {
    return handleApiError(err);
  }
}
