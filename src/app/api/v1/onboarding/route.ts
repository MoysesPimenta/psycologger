/**
 * POST /api/v1/onboarding
 * Creates a new user + tenant in one flow (public signup).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { created, handleApiError, apiError, rateLimit } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { generateSlug } from "@/lib/utils";

const schema = z.object({
  // name is optional for users who logged in via magic link (email provider doesn't
  // collect a name, so session.user.name is null and arrives here as "").
  name: z.string().max(100).default(""),
  email: z.string().email().toLowerCase(),
  clinicName: z.string().min(2).max(100),
});

export async function POST(req: NextRequest) {
  try {
    // Rate limiting: 5 signups per IP per hour
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rl = rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return apiError("RATE_LIMITED", "Muitas tentativas. Tente novamente em 1 hora.", 429);
    }

    const body = schema.parse(await req.json());
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Check if user already exists
    const existing = await db.user.findUnique({
      where: { email: body.email },
      include: {
        memberships: { where: { status: "ACTIVE" }, take: 1 },
      },
    });

    if (existing) {
      if (existing.memberships.length > 0) {
        // User already has an active membership — idempotent success.
        // This can happen if they submit the form twice or if there's a race condition.
        return created({ message: "Conta criada com sucesso." });
      }

      // User exists but has NO membership — this is the "magic link → onboarding" case.
      // NextAuth creates a bare user record on first login; the user then lands here to
      // name their clinic. Create the tenant + membership for them now.
      const result = await db.$transaction(async (tx) => {
        const slug = generateSlug(body.clinicName);

        const tenant = await tx.tenant.create({
          data: { name: body.clinicName, slug },
        });

        await tx.membership.create({
          data: {
            tenantId: tenant.id,
            userId: existing.id,
            role: "TENANT_ADMIN",
            status: "ACTIVE",
          },
        });

        return { user: existing, tenant };
      });

      await auditLog({
        tenantId: result.tenant.id,
        userId: result.user.id,
        action: "TENANT_CREATE",
        entity: "Tenant",
        entityId: result.tenant.id,
        summary: { tenantSlug: result.tenant.slug, via: "onboarding-existing-user" },
        ipAddress,
        userAgent,
      });

      return created({ message: "Conta criada com sucesso." });
    }

    // Brand-new user: create user + tenant + membership in one transaction
    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          name: body.name,
        },
      });

      const slug = generateSlug(body.clinicName);

      const tenant = await tx.tenant.create({
        data: {
          name: body.clinicName,
          slug,
        },
      });

      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "TENANT_ADMIN",
          status: "ACTIVE",
        },
      });

      return { user, tenant };
    });

    await auditLog({
      tenantId: result.tenant.id,
      userId: result.user.id,
      action: "TENANT_CREATE",
      entity: "Tenant",
      entityId: result.tenant.id,
      summary: { tenantSlug: result.tenant.slug },
      ipAddress,
      userAgent,
    });

    return created({ message: "Conta criada com sucesso." });
  } catch (err) {
    return handleApiError(err);
  }
}
