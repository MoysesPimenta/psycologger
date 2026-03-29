/**
 * Audit Logger — Psycologger
 * Records all significant actions with PHI redaction.
 */

import { db } from "./db";

export type AuditAction =
  // Auth
  | "LOGIN"
  | "LOGOUT"
  | "MAGIC_LINK_REQUESTED"
  | "IMPERSONATION_START"
  | "IMPERSONATION_END"
  // Tenant
  | "TENANT_CREATE"
  | "TENANT_UPDATE"
  | "TENANT_SETTINGS_UPDATE"
  // Users
  | "USER_INVITE"
  | "USER_INVITE_ACCEPT"
  | "USER_ROLE_CHANGE"
  | "USER_SUSPEND"
  | "USER_PROFILE_UPDATE"
  // Patients
  | "PATIENT_CREATE"
  | "PATIENT_UPDATE"
  | "PATIENT_ARCHIVE"
  | "PATIENT_RESTORE"
  // Appointments
  | "APPOINTMENT_CREATE"
  | "APPOINTMENT_UPDATE"
  | "APPOINTMENT_CANCEL"
  | "APPOINTMENT_NO_SHOW"
  | "APPOINTMENT_COMPLETE"
  // Sessions / EMR
  | "SESSION_CREATE"
  | "SESSION_UPDATE"
  | "SESSION_DELETE"
  | "SESSION_RESTORE"
  | "SESSION_REVISION_RESTORE"
  // Files
  | "FILE_UPLOAD"
  | "FILE_DOWNLOAD"
  | "FILE_DELETE"
  | "FILE_RESTORE"
  // Financial
  | "CHARGE_CREATE"
  | "CHARGE_UPDATE"
  | "CHARGE_DELETE"
  | "CHARGE_VOID"
  | "PAYMENT_CREATE"
  | "PAYMENT_UPDATE"
  // Appointment Types & Templates
  | "APPOINTMENT_TYPE_CREATE"
  | "APPOINTMENT_TYPE_UPDATE"
  | "APPOINTMENT_TYPE_DELETE"
  | "REMINDER_TEMPLATE_SAVE"
  // Integrations
  | "NFSE_ISSUE"
  | "GOOGLE_CALENDAR_CONNECT"
  | "GOOGLE_CALENDAR_DISCONNECT"
  | "INTEGRATION_CREDENTIAL_UPDATE";

export interface AuditParams {
  tenantId?: string;
  userId?: string;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  /** Redacted summary — DO NOT include PHI (names, notes, diagnosis) */
  summary?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function auditLog(params: AuditParams): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity ?? null,
        entityId: params.entityId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        summaryJson: params.summary ? (redact(params.summary) as any) : undefined,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch (err) {
    // Audit failures must never crash the main request
    console.error("[audit] Failed to write audit log:", err);
  }
}

/**
 * Redact known PHI field names from summary objects.
 * These keys should never appear in audit logs.
 */
const PHI_KEYS = new Set([
  "noteText", "note", "notes", "content", "body",
  "fullName", "name", "email", "phone", "cpf", "dob",
  "address", "diagnosis", "medication", "prescription",
]);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PHI_KEYS.has(key)) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redact(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extract IP + user agent from a Next.js request.
 */
export function extractRequestMeta(request: Request): {
  ipAddress: string | undefined;
  userAgent: string | undefined;
} {
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() ?? undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;
  return { ipAddress, userAgent };
}
