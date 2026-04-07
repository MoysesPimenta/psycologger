/**
 * POST /api/v1/onboarding
 * Creates a new user + tenant in one flow (public signup).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { created, handleApiError, apiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { generateSlug } from "@/lib/utils";
import { SIGNUP_RATE_LIMIT, SIGNUP_RATE_LIMIT_WINDOW_MS } from "@/lib/constants";

/**
 * Default appointment types seeded for every new tenant. Without these, the
 * first appointment creation crashes because `appointmentTypeId` is required.
 */
const DEFAULT_APPOINTMENT_TYPES: Array<{
  name: string;
  defaultDurationMin: number;
  defaultPriceCents: number;
  color: string;
  sessionType: "IN_PERSON" | "ONLINE" | "EVALUATION" | "GROUP";
}> = [
  { name: "Avaliação inicial", defaultDurationMin: 60, defaultPriceCents: 25000, color: "#3b82f6", sessionType: "EVALUATION" },
  { name: "Sessão de psicoterapia", defaultDurationMin: 50, defaultPriceCents: 20000, color: "#10b981", sessionType: "IN_PERSON" },
  { name: "Atendimento online", defaultDurationMin: 50, defaultPriceCents: 20000, color: "#8b5cf6", sessionType: "ONLINE" },
];

async function seedDefaultAppointmentTypes(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.appointmentType.createMany({
    data: DEFAULT_APPOINTMENT_TYPES.map((t) => ({ ...t, tenantId })),
    skipDuplicates: true,
  });
}

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
    const rl = await rateLimit(`signup:${ip}`, SIGNUP_RATE_LIMIT, SIGNUP_RATE_LIMIT_WINDOW_MS);
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
      // Retry up to 3 times to handle slug collisions (unique constraint on slug).
      let result: { user: typeof existing; tenant: { id: string; slug: string } } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await db.$transaction(async (tx) => {
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

            await seedDefaultAppointmentTypes(tx, tenant.id);

            return { user: existing, tenant };
          });
          break; // success
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) {
            continue; // slug collision — retry with new slug
          }
          throw e;
        }
      }
      if (!result) throw new Error("Failed to create tenant after retries");

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
    // Retry up to 3 times to handle slug collisions.
    let result2: { user: { id: string }; tenant: { id: string; slug: string } } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result2 = await db.$transaction(async (tx) => {
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

          await seedDefaultAppointmentTypes(tx, tenant.id);

          return { user, tenant };
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 2) {
          continue;
        }
        throw e;
      }
    }
    if (!result2) throw new Error("Failed to create tenant after retries");
    const result = result2;

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
