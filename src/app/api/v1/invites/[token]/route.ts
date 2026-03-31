/**
 * GET  /api/v1/invites/[token] — validate invite token
 * POST /api/v1/invites/[token] — accept invite
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, created, handleApiError, apiError, NotFoundError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
// Note: invite acceptance is public — no auth imports needed

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const invite = await db.invite.findUnique({
      where: { token: params.token },
      include: { tenant: { select: { name: true, slug: true } } },
    });

    if (!invite) throw new NotFoundError("Invite");
    if (invite.acceptedAt) return apiError("CONFLICT", "Este convite já foi utilizado.", 409);
    if (invite.expiresAt < new Date()) return apiError("GONE", "Este convite expirou.", 410);

    return ok({ email: invite.email, role: invite.role, tenant: invite.tenant });
  } catch (err) {
    return handleApiError(err);
  }
}

const acceptSchema = z.object({
  name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(100),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { ipAddress, userAgent } = extractRequestMeta(req);
    // Note: invite acceptance is public (no auth required — user may not have account yet)
    const body = acceptSchema.parse(await req.json());

    const invite = await db.invite.findUnique({
      where: { token: params.token },
    });

    if (!invite) throw new NotFoundError("Invite");
    if (invite.acceptedAt) return apiError("CONFLICT", "Este convite já foi utilizado.", 409);
    if (invite.expiresAt < new Date()) return apiError("GONE", "Este convite expirou.", 410);

    const result = await db.$transaction(async (tx) => {
      // Find or create user
      let user = await tx.user.findUnique({ where: { email: invite.email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email: invite.email,
            name: body.name,
          },
        });
      }

      // Create membership
      const membership = await tx.membership.upsert({
        where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
        create: {
          tenantId: invite.tenantId,
          userId: user.id,
          role: invite.role,
          status: "ACTIVE",
        },
        update: {
          role: invite.role,
          status: "ACTIVE",
        },
      });

      // Mark invite accepted
      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return { user, membership };
    });

    await auditLog({
      tenantId: invite.tenantId,
      userId: result.user.id,
      action: "USER_INVITE_ACCEPT",
      entity: "Membership",
      entityId: result.membership.id,
      summary: { role: invite.role },
      ipAddress,
      userAgent,
    });

    return created({ userId: result.user.id, tenantId: invite.tenantId });
  } catch (err) {
    return handleApiError(err);
  }
}
