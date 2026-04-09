/**
 * GET /api/v1/nfse/credentials — Check NFSe credentials status
 * PUT /api/v1/nfse/credentials — Save encrypted NFSe credentials
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { maskSecret } from "@/lib/crypto";
import type { PlugNotasCredentials } from "@/lib/nfse/types";

const credentialsSchema = z.object({
  apiKey: z.string().min(1),
  cnpj: z.string().min(14).max(14),
  inscricaoMunicipal: z.string().min(1),
  codigoMunicipio: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "integrations:configure");

    const credential = await db.integrationCredential.findUnique({
      where: {
        tenantId_type: {
          tenantId: ctx.tenantId,
          type: "NFSE",
        },
      },
      select: {
        id: true,
        status: true,
        providerName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Return status only (never decrypt credentials to client)
    return ok({
      configured: credential !== null,
      status: credential?.status ?? null,
      providerName: credential?.providerName ?? null,
      createdAt: credential?.createdAt ?? null,
      updatedAt: credential?.updatedAt ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "integrations:configure");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = credentialsSchema.parse(await req.json());

    // Encrypt the credentials
    const credentials: PlugNotasCredentials = {
      apiKey: body.apiKey,
      cnpj: body.cnpj,
      inscricaoMunicipal: body.inscricaoMunicipal,
      codigoMunicipio: body.codigoMunicipio,
    };

    const encryptedJson = await encryptJson(credentials);

    // Upsert the credentials
    const updated = await db.integrationCredential.upsert({
      where: {
        tenantId_type: {
          tenantId: ctx.tenantId,
          type: "NFSE",
        },
      },
      update: {
        encryptedJson,
        status: "ACTIVE",
        providerName: "PlugNotas",
        updatedAt: new Date(),
      },
      create: {
        tenantId: ctx.tenantId,
        type: "NFSE",
        encryptedJson,
        status: "ACTIVE",
        providerName: "PlugNotas",
      },
      select: {
        id: true,
        status: true,
        providerName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Audit log
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "INTEGRATION_CREDENTIAL_UPDATE",
      entity: "IntegrationCredential",
      entityId: updated.id,
      summary: {
        type: "NFSE",
        provider: "PlugNotas",
        apiKey: maskSecret(body.apiKey),
      },
      ipAddress,
      userAgent,
    });

    return ok({
      id: updated.id,
      status: updated.status,
      providerName: updated.providerName,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * DELETE /api/v1/nfse/credentials — Clear credentials
 */
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "integrations:configure");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const deleted = await db.integrationCredential.delete({
      where: {
        tenantId_type: {
          tenantId: ctx.tenantId,
          type: "NFSE",
        },
      },
      select: { id: true },
    });

    // Audit log
    await auditLog({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "INTEGRATION_CREDENTIAL_UPDATE",
      entity: "IntegrationCredential",
      entityId: deleted.id,
      summary: {
        action: "delete",
        type: "NFSE",
      },
      ipAddress,
      userAgent,
    });

    return ok({ deleted: true });
  } catch (err) {
    return handleApiError(err);
  }
}
