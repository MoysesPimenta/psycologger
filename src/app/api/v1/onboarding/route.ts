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
  name: z.string().min(2).max(100),
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
    const existing = await db.user.findUnique({ where: { email: body.email } });
    if (existing) {
      // Don't leak whether email exists — just say success
      return created({ message: "Conta criada com sucesso." });
    }

    // Create user + tenant + membership in a transaction
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
