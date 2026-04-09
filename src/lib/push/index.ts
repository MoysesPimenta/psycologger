/**
 * Push Notification Abstraction Layer — Psycologger
 *
 * Provides a provider-agnostic interface for registering device tokens and
 * sending push notifications. Currently a stub that logs to console; will be
 * wired to APNs (Apple) and FCM (Google) once credentials are configured.
 *
 * Environment variables for future wiring:
 *   - APNS_KEY_ID: Apple push notification key ID
 *   - APNS_TEAM_ID: Apple team ID
 *   - APNS_PRIVATE_KEY: Base64-encoded PKCS8 private key
 *   - FCM_SERVER_KEY: Firebase Cloud Messaging server key
 */

import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

/**
 * Payload shape for push notifications.
 * Platform-agnostic; implementations translate to APNs aps dict or FCM data.
 */
export interface PushPayload {
  title?: string;
  body?: string;
  badge?: number;
  sound?: string;
  data?: Record<string, string>;
  // Platform-specific overrides
  apns?: Record<string, unknown>;
  fcm?: Record<string, unknown>;
}

/**
 * Register a device token for push notifications.
 * Called by mobile clients after obtaining a device token from APNs/FCM/WebPush.
 *
 * Parameters:
 *   kind: "staff" or "patient" — determines which ID is used (userId vs patientId)
 *   actorId: userId (for staff) or patientId (for patient)
 *   tenantId: required for staff; inferred from patient's tenant for patient-portal
 *   platform: "IOS", "ANDROID", or "WEB"
 *   token: device token from push provider
 *   pushProvider: "APNS", "FCM", or "WEBPUSH"
 *   appVersion: optional app/build version
 *   locale: optional device locale (BCP47)
 *
 * Audited as "PUSH_TOKEN_REGISTERED" with platform, pushProvider.
 */
export async function registerDeviceToken(opts: {
  kind: "staff" | "patient";
  actorId: string;
  tenantId?: string;
  platform: "IOS" | "ANDROID" | "WEB";
  token: string;
  pushProvider: "APNS" | "FCM" | "WEBPUSH";
  appVersion?: string;
  locale?: string;
}): Promise<string> {
  try {
    const deviceToken = await db.deviceToken.upsert({
      where: { token: opts.token },
      update: {
        revokedAt: null, // Re-enable if previously revoked
        lastSeenAt: new Date(),
        appVersion: opts.appVersion,
        locale: opts.locale,
      },
      create: {
        userId: opts.kind === "staff" ? opts.actorId : undefined,
        patientId: opts.kind === "patient" ? opts.actorId : undefined,
        tenantId: opts.tenantId,
        platform: opts.platform,
        token: opts.token,
        pushProvider: opts.pushProvider,
        appVersion: opts.appVersion,
        locale: opts.locale,
      },
    });

    // Audit
    await auditLog({
      tenantId: opts.tenantId,
      userId: opts.kind === "staff" ? opts.actorId : undefined,
      action: "PUSH_TOKEN_REGISTERED",
      entity: "DeviceToken",
      entityId: deviceToken.id,
      summary: {
        platform: opts.platform,
        pushProvider: opts.pushProvider,
        kind: opts.kind,
      },
    });

    return deviceToken.id;
  } catch (err) {
    console.error("[push] registerDeviceToken failed:", err);
    throw err;
  }
}

/**
 * Revoke a device token (soft-delete).
 * Called when user logs out, uninstalls app, or explicitly revokes device access.
 *
 * Audited as "PUSH_TOKEN_REVOKED".
 */
export async function revokeDeviceToken(opts: {
  token: string;
}): Promise<void> {
  try {
    const deviceToken = await db.deviceToken.findUnique({
      where: { token: opts.token },
    });

    if (!deviceToken) {
      console.warn(
        `[push] revokeDeviceToken: token not found (already revoked?)`
      );
      return;
    }

    await db.deviceToken.update({
      where: { id: deviceToken.id },
      data: { revokedAt: new Date() },
    });

    await auditLog({
      tenantId: deviceToken.tenantId ?? undefined,
      userId: deviceToken.userId ?? undefined,
      action: "PUSH_TOKEN_REVOKED",
      entity: "DeviceToken",
      entityId: deviceToken.id,
      summary: {
        platform: deviceToken.platform,
        pushProvider: deviceToken.pushProvider,
      },
    });
  } catch (err) {
    console.error("[push] revokeDeviceToken failed:", err);
    throw err;
  }
}

/**
 * Send push notification to a staff user (by userId).
 * Currently a no-op stub — always returns { sent: false, reason: "provider-not-configured" }
 * until APNS_KEY_ID/APNS_TEAM_ID/FCM_SERVER_KEY are configured.
 *
 * Future: Will resolve user's active devices and dispatch to APNs/FCM.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: boolean; reason?: string }> {
  console.log(
    `[push] would send to userId ${userId}: ${JSON.stringify(payload)}`
  );
  return { sent: false, reason: "provider-not-configured" };
}

/**
 * Send push notification to a patient (by patientId).
 * Currently a no-op stub — always returns { sent: false, reason: "provider-not-configured" }
 * until APNS_KEY_ID/APNS_TEAM_ID/FCM_SERVER_KEY are configured.
 *
 * Future: Will resolve patient's active devices and dispatch to APNs/FCM.
 */
export async function sendPushToPatient(
  patientId: string,
  payload: PushPayload
): Promise<{ sent: boolean; reason?: string }> {
  console.log(
    `[push] would send to patientId ${patientId}: ${JSON.stringify(payload)}`
  );
  return { sent: false, reason: "provider-not-configured" };
}
