/**
 * POST /api/v1/nfse/issue — Issue NFSe for a paid charge
 *
 * Request body:
 *   - chargeId (string, UUID): The charge to issue NFSe for
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { ok, created, handleApiError, BadRequestError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { auditLog, extractRequestMeta } from "@/lib/audit";
import { decryptJson } from "@/lib/crypto";
import type { NfseStatus } from "@prisma/client";
import { decryptCpf } from "@/lib/cpf-crypto";
import { issueNfse } from "@/lib/nfse/plugnotas";
import type { PlugNotasCredentials } from "@/lib/nfse/types";

const bodySchema = z.object({
  chargeId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    requirePermission(ctx, "nfse:issue");
    const { ipAddress, userAgent } = extractRequestMeta(req);

    const body = bodySchema.parse(await req.json());

    // Fetch the charge
    const charge = await db.charge.findFirst({
      where: {
        id: body.chargeId,
        tenantId: ctx.tenantId,
      },
      include: {
        patient: { select: { id: true, fullName: true, cpf: true } },
        nfseInvoice: { select: { id: true, status: true } },
      },
    });

    if (!charge) {
      throw new BadRequestError("Cobrança não encontrada");
    }

    // Check that charge is PAID
    if (charge.status !== "PAID") {
      throw new BadRequestError("Cobrança deve estar marcada como paga");
    }

    // Check no NFSe already exists
    if (charge.nfseInvoice) {
      throw new BadRequestError("Nota fiscal já existe para esta cobrança");
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

    if (integrationCred.status !== "ACTIVE") {
      throw new BadRequestError("Integração PlugNotas desativada");
    }

    // Decrypt credentials
    const credentials = await decryptJson<PlugNotasCredentials>(
      integrationCred.encryptedJson,
    );

    // Decrypt CPF (handles both encrypted and plaintext)
    let cpf = await decryptCpf(charge.patient.cpf);
    if (!cpf) {
      throw new BadRequestError("CPF do paciente não disponível");
    }

    // Issue NFSe via PlugNotas
    const issueResult = await issueNfse(credentials, {
      cpfTomador: cpf,
      nomeTomador: charge.patient.fullName,
      descricao: "Serviços de Psicologia",
      valorServico: charge.amountCents - charge.discountCents,
    });

    if (!issueResult.success) {
      // Create FAILED invoice
      const invoice = await db.nfseInvoice.create({
        data: {
          tenantId: ctx.tenantId,
          patientId: charge.patient.id,
          chargeId: charge.id,
          provider: "PlugNotas",
          status: "FAILED",
          rawResponseRedacted: { error: issueResult.error },
        },
        select: {
          id: true,
          status: true,
          externalId: true,
        },
      });

      // Audit log
      await auditLog({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "NFSE_ISSUE",
        entity: "NfseInvoice",
        entityId: invoice.id,
        summary: {
          chargeId: charge.id,
          status: "FAILED",
          error: issueResult.error,
        },
        ipAddress,
        userAgent,
      });

      return created({
        id: invoice.id,
        status: invoice.status,
        externalId: invoice.externalId,
        error: issueResult.error,
      });
    }

    // Create invoice with response data
    const invoice = await db.nfseInvoice.create({
      data: {
        tenantId: ctx.tenantId,
        patientId: charge.patient.id,
        chargeId: charge.id,
        provider: "PlugNotas",
        status: (issueResult.status as NfseStatus) || "QUEUED",
        externalId: issueResult.externalId || undefined,
        pdfUrl: issueResult.pdfUrl || undefined,
        xmlUrl: issueResult.xmlUrl || undefined,
        issuedAt: issueResult.issuedAt ? new Date(issueResult.issuedAt) : undefined,
        rawResponseRedacted: {
          // Store only non-sensitive response data
          status: issueResult.status,
          externalId: issueResult.externalId,
        },
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
      entityId: invoice.id,
      summary: {
        chargeId: charge.id,
        status: invoice.status,
        externalId: invoice.externalId,
      },
      ipAddress,
      userAgent,
    });

    return created(invoice);
  } catch (err) {
    return handleApiError(err);
  }
}
