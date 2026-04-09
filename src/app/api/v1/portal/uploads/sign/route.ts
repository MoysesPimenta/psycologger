/**
 * POST /api/v1/portal/uploads/sign
 *
 * Patient portal version of signed-URL upload endpoint.
 * Patient-portal authenticated (requires valid PatientAuth session and consent).
 *
 * Request body:
 *   {
 *     purpose: "portal-document" | "journal-attachment",
 *     filename: string,
 *     contentType: string,
 *     sizeBytes: number
 *   }
 *
 * Response:
 *   {
 *     uploadUrl: string,          // Signed Supabase Storage PUT URL (15-min TTL)
 *     storagePath: string,        // Tenant/patient-scoped (tenantId/patients/patientId/...)
 *     expiresAt: ISO8601,
 *     maxBytes: number
 *   }
 *
 * Content-type and size enforcement by purpose:
 *   - portal-document: ≤ 10MB, application/pdf | image/*
 *   - journal-attachment: ≤ 5MB, image/* only
 *
 * Tenant scoping: storagePath always starts with {tenantId}/patients/{patientId}/
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPatientContext } from "@/lib/patient-auth";
import { db } from "@/lib/db";
import { handleApiError, created, apiError } from "@/lib/api";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import crypto from "crypto";

const SIGNED_URL_TTL_SECONDS = 15 * 60; // 15 minutes

const PURPOSE_RULES: Record<
  string,
  { maxBytes: number; contentTypes: string[] }
> = {
  "portal-document": {
    maxBytes: 10 * 1024 * 1024, // 10MB
    contentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  },
  "journal-attachment": {
    maxBytes: 5 * 1024 * 1024, // 5MB
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
  },
};

const schema = z.object({
  purpose: z.enum(["portal-document", "journal-attachment"]),
  filename: z.string().min(1).max(255),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  try {
    const patientCtx = await getPatientContext(req);
    if (!patientCtx) {
      return apiError("UNAUTHORIZED", "Patient session required", 401);
    }

    // Verify portal access consent
    const consent = await db.consentRecord.findFirst({
      where: {
        patientId: patientCtx.patientId,
        revokedAt: null,
      },
    });

    if (!consent) {
      return apiError("FORBIDDEN", "Portal access consent required", 403);
    }

    const body = await req.json();
    const { purpose, filename, contentType, sizeBytes } = schema.parse(body);

    const rules = PURPOSE_RULES[purpose];
    if (!rules) {
      return apiError("BAD_REQUEST", "Invalid purpose", 400);
    }

    // Validate content type
    if (!rules.contentTypes.includes(contentType)) {
      return apiError(
        "BAD_REQUEST",
        `Invalid content type for ${purpose}: ${contentType}`,
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

    // Generate storage path: tenantId/patients/patientId/purpose/fileId
    const fileId = crypto.randomUUID();
    const ext = filename.split(".").pop() || "bin";
    const sanitizedFilename = `${fileId}.${ext}`;

    // Use patient context tenantId directly
    const storagePath = `${patientCtx.tenantId}/patients/${patientCtx.patientId}/${purpose}/${sanitizedFilename}`;

    // Generate signed URL via Supabase REST API
    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY ?? "";
    const bucket = "session-files";

    if (!supabaseUrl || !supabaseServiceKey) {
      return apiError("INTERNAL_ERROR", "Storage not configured", 500);
    }

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
        `[portal/uploads/sign] Supabase sign failed: HTTP ${signRes.status}`
      );
      return apiError("INTERNAL_ERROR", "Failed to generate signed URL", 500);
    }

    const signedData = await signRes.json();
    const uploadUrl = `${supabaseUrl}/storage/v1${signedData.signedURL}`;
    const expiresAt = new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1000
    ).toISOString();

    // Audit log via patient
    const { ipAddress, userAgent } = extractRequestMeta(req);
    await auditLog({
      tenantId: patientCtx.tenantId,
      userId: undefined, // Patient portal, no staff user
      action: "UPLOAD_URL_SIGNED",
      entity: "FileObject",
      summary: {
        purpose,
        sizeBytes,
        storagePath,
      },
      ipAddress,
      userAgent,
    });

    return created({
      uploadUrl,
      storagePath,
      expiresAt,
      maxBytes: rules.maxBytes,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
