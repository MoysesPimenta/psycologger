/**
 * GET  /api/v1/users — list tenant members
 * POST /api/v1/users/invite — invite a user
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, apiError, parsePagination, buildMeta } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { sendInviteEmail } from "@/lib/email";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "users:view");

    const { page, pageSize, skip } = parsePagination(req.nextUrl.searchParams);

    const [members, total] = await Promise.all([
      db.membership.findMany({
        where: { tenantId: ctx.tenantId },
        include: {
          user: {
            select: { id: true, name: true, email: true, lastLoginAt: true, imageUrl: true },
          },
        },
        orderBy: { createdAt: "asc" },
        skip,
        take: pageSize,
      }),
      db.membership.count({ where: { tenantId: ctx.tenantId } }),
    ]);

    return ok(members, buildMeta(total, { page, pageSize }));
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

    const { INVITE_EXPIRY_MS } = await import("@/lib/constants");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

    // Use high-entropy token instead of default CUID to prevent enumeration
    const token = randomBytes(32).toString("base64url");

    // Upsert: if an invite already exists for this email+tenant, replace it
    // (handles the @@unique([tenantId, email]) constraint)
    const invite = await db.invite.upsert({
      where: {
        tenantId_email: { tenantId: ctx.tenantId, email: body.email },
      } as never,
      update: {
        role: body.role,
        expiresAt,
        sentById: ctx.userId,
        token,
        acceptedAt: null,
      },
      create: {
        tenantId: ctx.tenantId,
        email: body.email,
        role: body.role,
        expiresAt,
        sentById: ctx.userId,
        token,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const inviteUrl = `${baseUrl}/invite/${invite.token}`;

    // Send invite email (non-fatal — invite link still works if email fails)
    let emailSent = true;
    try {
      await sendInviteEmail({
        to: body.email,
        inviteUrl,
        tenantName: tenant?.name ?? "Psycologger",
        role: body.role,
        inviterName: inviter?.name ?? undefined,
      });
    } catch (emailErr) {
      console.error("[users/invite] Email send failed:", emailErr);
      emailSent = false;
    }

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

    return created({ id: invite.id, email: body.email, role: body.role, expiresAt, emailSent, inviteUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
