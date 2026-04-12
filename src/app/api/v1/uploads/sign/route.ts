/**
 * POST /api/v1/uploads/sign
 *
 * Generate a signed upload URL for mobile clients to upload directly to Supabase Storage.
 * Staff-authenticated via requireUser (supports NextAuth + bearer token).
 *
 * Request body:
 *   {
 *     purpose: "patient-file" | "clinical-file" | "profile-avatar",
 *     filename: string,
 *     contentType: string,
 *     sizeBytes: number,
 *     patientId?: string (required for patient-file and clinical-file)
 *   }
 *
 * Response:
 *   {
 *     uploadUrl: string,          // Signed Supabase Storage PUT URL (15-min TTL)
 *     storagePath: string,        // Tenant-scoped path (tenantId/...)
 *     token: string,              // Bearer token (for reference)
 *     expiresAt: ISO8601,         // URL expiry time
 *     maxBytes: number            // Maximum allowed file size
 *   }
 *
 * Content-type and size enforcement by purpose:
 *   - profile-avatar: ≤ 2MB, image/* only
 *   - patient-file: ≤ 25MB, application/pdf | image/* | text/*
 *   - clinical-file: ≤ 50MB, application/pdf | image/* | text/*
 *
 * Tenant scoping: All storagePath values start with {tenantId}/
 * to prevent leaked URLs from escaping tenant boundaries.
 *
 * Audited as "UPLOAD_URL_SIGNED" with purpose, sizeBytes, storagePath.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { handleApiError, created, apiError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import crypto from "crypto";

const SIGNED_URL_TTL_SECONDS = 15 * 60; // 15 minutes

const PURPOSE_RULES: Record<
  string,
  { maxBytes: number; contentTypes: string[] }
> = {
  "profile-avatar": {
    maxBytes: 2 * 1024 * 1024, // 2MB
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  "patient-file": {
    maxBytes: 25 * 1024 * 1024, // 25MB
    contentTypes: ["application/pdf", "image/jpeg", "image/png", "text/plain"],
  },
  "clinical-file": {
    maxBytes: 50 * 1024 * 1024, // 50MB
    contentTypes: ["application/pdf", "image/jpeg", "image/png", "text/plain"],
  },
};

const schema = z.object({
  purpose: z.enum(["patient-file", "clinical-file", "profile-avatar"]),
  filename: z.string().min(1).max(255),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  patientId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req);
    const membership = await db.membership.findFirst({
      where: { userId },
      include: { tenant: true },
    });
    if (!membership) return apiError("UNAUTHORIZED", "User not found", 401);
    const user = { id: userId, role: membership.role, tenantId: membership.tenantId };

    const body = await req.json();
    const { purpose, filename, contentType, sizeBytes, patientId } =
      schema.parse(body);

    const rules = PURPOSE_RULES[purpose];
    if (!rules) {
      return apiError("BAD_REQUEST", "Invalid purpose", 400);
    }

    // SECURITY: Validate content type against strict allowlist for the purpose
    // This prevents clients from requesting signed URLs for arbitrary content types
    if (!rules.contentTypes.includes(contentType)) {
      return apiError(
        "BAD_REQUEST",
        `Invalid content type for ${purpose}: ${contentType}. Allowed: ${rules.contentTypes.join(", ")}`,
        400
      );
    }

    // Validate file size
    if (sizeBytes > rules.maxBytes) {
      return apiError(
        "BAD_REQUEST",
        `File exceeds ${rules.maxBytes} bytes for ${purpose}`,
        400
      );
    }

    // If patientId is provided, verify access
    if (patientId) {
      const patient = await db.patient.findUnique({
        where: { id: patientId, tenantId: user.tenantId },
      });
      if (!patient) {
        return apiError("NOT_FOUND", "Patient not found or access denied", 404);
      }

      // Additional role-based check for psychologist scope
      if (user.role === "PSYCHOLOGIST") {
        const isAssigned = await db.appointment
          .findFirst({
            where: {
              patientId,
              providerUserId: user.id,
              tenantId: user.tenantId,
            },
          })
          .then((a) => !!a);

        if (!isAssigned) {
          return apiError(
            "FORBIDDEN",
            "Not assigned to this patient",
            403
          );
        }
      }
    }

    // Generate storage path with tenant scoping
    const fileId = crypto.randomUUID();
    const ext = filename.split(".").pop() || "bin";
    const sanitizedFilename = `${fileId}.${ext}`;

    let storagePath = `${user.tenantId}/`;
    if (purpose === "profile-avatar") {
      storagePath += `avatars/${user.id}/${sanitizedFilename}`;
    } else if (patientId) {
      storagePath += `patients/${patientId}/${purpose}/${sanitizedFilename}`;
    } else {
      storagePath += `uploads/${user.id}/${sanitizedFilename}`;
    }

    // Generate signed URL via Supabase REST API
    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY ?? "";
    const bucket = "session-files";

    if (!supabaseUrl || !supabaseServiceKey) {
      return apiError(
        "INTERNAL_ERROR",
        "Storage not configured",
        500
      );
    }

    // Call Supabase signed URL endpoint for PUT
    const signRes = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${storagePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          apikey: supabaseServiceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expiresIn: SIGNED_URL_TTL_SECONDS,
        }),
      }
    );

    if (!signRes.ok) {
      console.error(
        `[uploads/sign] Supabase sign failed: HTTP ${signRes.status}`
      );
      return apiError("INTERNAL_ERROR", "Failed to generate signed URL", 500);
    }

    const signedData = await signRes.json();
    const uploadUrl = `${supabaseUrl}/storage/v1${signedData.signedURL}`;
    const expiresAt = new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1000
    ).toISOString();

    // Audit log
    const { ipAddress, userAgent } = extractRequestMeta(req);
    await auditLog({
      tenantId: user.tenantId,
      userId: user.id,
      action: "UPLOAD_URL_SIGNED",
      entity: "FileObject",
      summary: {
        purpose,
        sizeBytes,
        storagePath,
        // Never log filename or patientId to avoid PII
      },
      ipAddress,
      userAgent,
    });

    return created({
      uploadUrl,
      storagePath,
      token: `Bearer ${supabaseServiceKey}`,
      expiresAt,
      maxBytes: rules.maxBytes,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
