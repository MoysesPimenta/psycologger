/**
 * GET  /api/v1/patients — list patients (paginated, filtered)
 * POST /api/v1/patients — create patient
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import {
  ok, created, handleApiError, parsePagination, buildMeta, BadRequestError,
} from "@/lib/api";
import { requirePermission, getPatientScope, ForbiddenError } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { encryptCpf, decryptPatientCpfs, cpfBlindIndex, isCpfShapedQuery } from "@/lib/cpf-crypto";
import { encryptPatientNotes, decryptPatientNotes } from "@/lib/patient-notes";
import { assertCanAddPatient } from "@/lib/billing/limits";
import { rateLimit } from "@/lib/rate-limit";

const createSchema = z.object({
  fullName: z.string().min(2).max(100),
  preferredName: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  cpf: z.string().max(14).optional(),
  dob: z.string().optional(), // ISO date string
  notes: z.string().max(500).optional(),
  tags: z.array(z.string()).default([]),
  assignedUserId: z.string().uuid().optional(),
  defaultAppointmentTypeId: z.string().uuid().optional(),
  defaultFeeOverrideCents: z.number().int().min(0).max(100_000_000).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");
    requireTenant(ctx);

    const { searchParams } = new URL(req.url);
    const pagination = parsePagination(searchParams);
    const search = searchParams.get("q") ?? "";
    const tag = searchParams.get("tag") ?? "";
    // ?active=true (default) → only active; ?active=false → only inactive; ?active=all → both
    const activeParam = searchParams.get("active") ?? "true";
    const activeFilter =
      activeParam === "all" ? undefined : activeParam !== "false";

    const scope = getPatientScope(ctx);
    const whereClause = {
      tenantId: ctx.tenantId,
      ...(activeFilter !== undefined && { isActive: activeFilter }),
      ...(scope === "ASSIGNED" && { assignedUserId: ctx.userId }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: "insensitive" as const } },
          { preferredName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search, mode: "insensitive" as const } },
          // CPF lookup via deterministic blind index — never decrypts at rest.
          ...(isCpfShapedQuery(search)
            ? [{ cpfBlindIndex: cpfBlindIndex(search) }]
            : []),
        ],
      }),
      ...(tag && { tags: { has: tag } }),
    };

    const [patients, total] = await Promise.all([
      db.patient.findMany({
        where: whereClause,
        include: {
          assignedUser: { select: { id: true, name: true } },
          _count: { select: { appointments: true, charges: true } },
        },
        orderBy: { fullName: "asc" },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      db.patient.count({ where: whereClause }),
    ]);

    // Decrypt CPF and notes fields before returning to client
    const decryptedPatients = await decryptPatientCpfs(patients);
    const withDecryptedNotes = await Promise.all(
      decryptedPatients.map(async (p) => ({
        ...p,
        notes: await decryptPatientNotes(p.notes),
      }))
    );

    return ok(withDecryptedNotes, buildMeta(total, pagination));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:create");
    requireTenant(ctx);
    const { ipAddress, userAgent } = extractRequestMeta(req);

    // Rate limit: 60 patient creates per user per hour
    const rl = await rateLimit(`patients:create:${ctx.tenantId}:${ctx.userId}`, 60, 3600 * 1000);
    if (!rl.allowed) {
      return Response.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait before creating more patients." } },
        { status: 429 }
      );
    }

    const body = createSchema.parse(await req.json());

    // Plan entitlement gate — must run BEFORE create. Throws QuotaExceededError (402).
    await assertCanAddPatient(ctx.tenantId);

    // Validate assignedUserId: non-admins can only assign to themselves
    if (body.assignedUserId && body.assignedUserId !== ctx.userId) {
      if (ctx.role !== "SUPERADMIN" && ctx.role !== "TENANT_ADMIN") {
        throw new ForbiddenError(
          "Apenas administradores podem atribuir pacientes a outros profissionais."
        );
      }
      // Verify target user belongs to this tenant
      const targetMembership = await db.membership.findFirst({
        where: { tenantId: ctx.tenantId, userId: body.assignedUserId, status: "ACTIVE" },
      });
      if (!targetMembership) {
        throw new BadRequestError(
          "Usuário de destino não encontrado nesta clínica."
        );
      }
    }

    const patient = await db.patient.create({
      data: {
        tenantId: ctx.tenantId,
        assignedUserId: body.assignedUserId ?? ctx.userId,
        fullName: body.fullName,
        preferredName: body.preferredName ?? null,
        email: body.email || null,
        phone: body.phone ?? null,
        cpf: (await encryptCpf(body.cpf)) ?? null,
        cpfBlindIndex: body.cpf && body.cpf.trim() !== "" ? cpfBlindIndex(body.cpf) : null,
        dob: body.dob ? new Date(body.dob) : null,
        notes: await encryptPatientNotes(body.notes ?? null),
        tags: body.tags,
        ...(body.defaultAppointmentTypeId && { defaultAppointmentTypeId: body.defaultAppointmentTypeId }),
        ...(body.defaultFeeOverrideCents !== undefined && { defaultFeeOverrideCents: body.defaultFeeOverrideCents }),
      },
    });

    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "PATIENT_CREATE",
      entity: "Patient",
      entityId: patient.id,
      summary: { patientId: patient.id },
      ipAddress,
      userAgent,
    });

    return created(patient);
  } catch (err) {
    return handleApiError(err);
  }
}
