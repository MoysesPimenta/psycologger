/**
 * GET /api/v1/cron/nfse-status-check
 *
 * Called every 4 hours via Vercel Cron to check status of QUEUED/PROCESSING
 * NFSe invoices and update their status/URLs.
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCronAuth } from "@/lib/cron-auth";
import { decryptJson } from "@/lib/crypto";
import { checkStatus } from "@/lib/nfse/nfse-nacional";
import type { NfseNacionalCredentials } from "@/lib/nfse/types";
import type { NfseStatus } from "@prisma/client";

const TAG = "[nfse-status-check]";

interface InvoiceWithCredential {
  id: string;
  tenantId: string;
  externalId: string | null;
  status: string;
  integrationCredential: {
    encryptedJson: string;
  } | null;
}

export async function GET(req: NextRequest) {
  const cronAuth = requireCronAuth(req);
  if (cronAuth) return cronAuth;

  try {
    console.log(`${TAG} Starting NFSe status check`);

    // Find all QUEUED/PROCESSING invoices with their tenant's credentials
    const invoices = await db.nfseInvoice.findMany({
      where: {
        status: {
          in: ["QUEUED", "PROCESSING"],
        },
      },
      include: {
        tenant: {
          include: {
            integrations: {
              where: { type: "NFSE" },
              take: 1,
            },
          },
        },
      },
      take: 100, // Process up to 100 per cron run
    });

    console.log(`${TAG} Found ${invoices.length} invoices to check`);

    let updated = 0;
    let failed = 0;

    for (const invoice of invoices) {
      try {
        // Validate we have credentials
        const cred = invoice.tenant.integrations[0];
        if (!cred) {
          console.warn(`${TAG} Invoice ${invoice.id} has no credentials, skipping`);
          continue;
        }

        if (cred.status !== "ACTIVE") {
          console.warn(`${TAG} Invoice ${invoice.id} credential is inactive, skipping`);
          continue;
        }

        // No external ID yet (still drafting)
        if (!invoice.externalId) {
          console.warn(`${TAG} Invoice ${invoice.id} has no externalId, skipping`);
          continue;
        }

        // Decrypt credentials
        const credentials = await decryptJson<NfseNacionalCredentials>(
          cred.encryptedJson,
        );

        // Check status with NFSe Nacional
        const statusResult = await checkStatus(credentials, invoice.externalId);

        if (!statusResult.success) {
          console.warn(
            `${TAG} Check status failed for invoice ${invoice.id}:`,
            statusResult.error,
          );
          failed++;
          continue;
        }

        // Update invoice
        await db.nfseInvoice.update({
          where: { id: invoice.id },
          data: {
            status: (statusResult.status as NfseStatus) || invoice.status,
            pdfUrl: statusResult.pdfUrl || invoice.pdfUrl || undefined,
            xmlUrl: statusResult.xmlUrl || invoice.xmlUrl || undefined,
            issuedAt: statusResult.issuedAt
              ? new Date(statusResult.issuedAt)
              : invoice.issuedAt || undefined,
            rawResponseRedacted: {
              status: statusResult.status,
              pdfUrl: statusResult.pdfUrl,
              xmlUrl: statusResult.xmlUrl,
            },
            updatedAt: new Date(),
          },
        });

        updated++;
        console.log(`${TAG} Updated invoice ${invoice.id} to ${statusResult.status}`);
      } catch (err) {
        console.error(`${TAG} Error checking invoice ${invoice.id}:`, err);
        failed++;
      }
    }

    console.log(`${TAG} Complete: ${updated} updated, ${failed} failed`);

    return NextResponse.json({
      success: true,
      invoicesChecked: invoices.length,
      updated,
      failed,
    });
  } catch (err) {
    console.error(`${TAG} Cron job failed:`, err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
