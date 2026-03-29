/**
 * GET  /api/v1/patients — list patients (paginated, filtered)
 * POST /api/v1/patients — create patient
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import {
  ok, created, handleApiError, parsePagination, buildMeta,
} from "@/lib/api";
import { requirePermission, getPatientScope } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";

const createSchema = z.object({
  fullName: z.string().min(2).max(100),
  preferredName: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(20).optional(),
  dob: z.string().optional(), // ISO date string
  notes: z.string().max(500).optional(),
  tags: z.array(z.string()).default([]),
  assignedUserId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:list");

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

    return ok(patients, buildMeta(total, pagination));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "patients:create");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = createSchema.parse(await req.json());

    const patient = await db.patient.create({
      data: {
        tenantId: ctx.tenantId,
        assignedUserId: body.assignedUserId ?? ctx.userId,
        fullName: body.fullName,
        preferredName: body.preferredName ?? null,
        email: body.email || null,
        phone: body.phone ?? null,
        dob: body.dob ? new Date(body.dob) : null,
        notes: body.notes ?? null,
        tags: body.tags,
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
