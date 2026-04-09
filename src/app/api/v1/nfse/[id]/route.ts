/**
 * GET /api/v1/nfse/[id] — Get NFSe invoice status
 * POST /api/v1/nfse/[id] — Perform actions (cancel)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, handleApiError, BadRequestError, NotFoundError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { decryptJson } from "@/lib/crypto";
import { checkStatus, cancelNfse } from "@/lib/nfse/plugnotas";
import type { PlugNotasCredentials } from "@/lib/nfse/types";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "nfse:issue");

    const invoice = await db.nfseInvoice.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
      },
      select: {
        id: true,
        status: true,
        externalId: true,
        pdfUrl: true,
        xmlUrl: true,
        issuedAt: true,
        createdAt: true,
        updatedAt: true,
        charge: {
          select: {
            id: true,
            amountCents: true,
            discountCents: true,
            currency: true,
          },
        },
        patientId: true,
      },
    });

    if (!invoice) {
      throw new NotFoundError("Nota fiscal");
    }

    return ok(invoice);
  } catch (err) {
    return handleApiError(err);
  }
}

const actionSchema = z.object({
  action: z.enum(["cancel"]),
  reason: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "nfse:issue");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = actionSchema.parse(await req.json());

    const invoice = await db.nfseInvoice.findFirst({
      where: {
        id: params.id,
        tenantId: ctx.tenantId,
      },
    });

    if (!invoice) {
      throw new NotFoundError("Nota fiscal");
    }

    if (body.action === "cancel") {
      // Only ISSUED invoices can be canceled
      if (invoice.status !== "ISSUED") {
        throw new BadRequestError(
          "Apenas notas fiscais emitidas podem ser canceladas",
        );
      }

      if (!invoice.externalId) {
        throw new BadRequestError(
          "Nota fiscal não tem ID externo para cancelamento",
        );
      }

      // Get credentials
      const integrationCred = await db.integrationCredential.findUnique({
        where: {
          tenantId_type: {
            tenantId: ctx.tenantId,
            type: "NFSE",
          },
        },
      });

      if (!integrationCred) {
        throw new BadRequestError("Credenciais do PlugNotas não configuradas");
      }

      // Decrypt credentials
      const credentials = await decryptJson<PlugNotasCredentials>(
        integrationCred.encryptedJson,
      );

      // Call PlugNotas to cancel
      const cancelResult = await cancelNfse(
        credentials,
        invoice.externalId,
        body.reason,
      );

      if (!cancelResult.success) {
        throw new BadRequestError(
          `Falha ao cancelar nota fiscal: ${cancelResult.error}`,
        );
      }

      // Update invoice
      const updated = await db.nfseInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "CANCELED",
          updatedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          externalId: true,
          pdfUrl: true,
          xmlUrl: true,
          issuedAt: true,
        },
      });

      // Audit log
      await auditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "NFSE_ISSUE",
        entity: "NfseInvoice",
        entityId: updated.id,
        summary: {
          action: "cancel",
          invoiceId: updated.id,
          reason: body.reason,
        },
        ipAddress,
        userAgent,
      });

      return ok(updated);
    }

    throw new BadRequestError("Ação desconhecida");
  } catch (err) {
    return handleApiError(err);
  }
}
