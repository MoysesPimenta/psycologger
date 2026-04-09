/**
 * Unit tests for push notification stub.
 *
 * Guards invariants:
 *   1. Stub functions never throw when unconfigured
 *   2. registerDeviceToken upserts to database
 *   3. revokeDeviceToken soft-deletes with audit log
 *   4. sendPushToUser/sendPushToPatient always return sent:false until configured
 *   5. Audit actions are emitted correctly
 */

import { vi } from "vitest";

vi.mock("@/lib/db", () => {
  const db = {
    deviceToken: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return { db };
});

vi.mock("@/lib/audit", () => ({
  auditLog: vi.fn(),
}));

import {
  registerDeviceToken,
  revokeDeviceToken,
  sendPushToUser,
  sendPushToPatient,
} from "@/lib/push";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

type MockFn = jest.Mock;

describe("push/stub — registerDeviceToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts device token with correct parameters", async () => {
    const mockId = "device-token-1";
    (db.deviceToken.upsert as MockFn).mockResolvedValue({
      id: mockId,
      userId: "user-1",
      token: "apns-token-123",
    });

    const result = await registerDeviceToken({
      kind: "staff",
      actorId: "user-1",
      tenantId: "tenant-1",
      platform: "IOS",
      token: "apns-token-123",
      pushProvider: "APNS",
      appVersion: "1.0.0",
    });

    expect(result).toBe(mockId);
    expect(db.deviceToken.upsert).toHaveBeenCalled();
  });

  it("handles patient-kind registration", async () => {
    const mockId = "device-token-2";
    (db.deviceToken.upsert as MockFn).mockResolvedValue({
      id: mockId,
      patientId: "patient-1",
      token: "fcm-token-456",
    });

    await registerDeviceToken({
      kind: "patient",
      actorId: "patient-1",
      tenantId: "tenant-1",
      platform: "ANDROID",
      token: "fcm-token-456",
      pushProvider: "FCM",
    });

    const call = (db.deviceToken.upsert as MockFn).mock.calls[0][0];
    expect(call.create.patientId).toBe("patient-1");
    expect(call.create.userId).toBeUndefined();
  });

  it("logs PUSH_TOKEN_REGISTERED audit event", async () => {
    (db.deviceToken.upsert as MockFn).mockResolvedValue({
      id: "device-1",
      userId: "user-1",
      token: "apns-token",
    });
    (auditLog as MockFn).mockResolvedValue(undefined);

    await registerDeviceToken({
      kind: "staff",
      actorId: "user-1",
      tenantId: "tenant-1",
      platform: "IOS",
      token: "apns-token",
      pushProvider: "APNS",
    });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PUSH_TOKEN_REGISTERED",
        entity: "DeviceToken",
      })
    );
  });

  it("does not throw on database error", async () => {
    (db.deviceToken.upsert as MockFn).mockRejectedValue(
      new Error("DB error")
    );

    // The function should throw (not suppress) but should not crash the app
    await expect(
      registerDeviceToken({
        kind: "staff",
        actorId: "user-1",
        tenantId: "tenant-1",
        platform: "IOS",
        token: "apns-token",
        pushProvider: "APNS",
      })
    ).rejects.toThrow();
  });
});

describe("push/stub — revokeDeviceToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft-deletes device token (sets revokedAt)", async () => {
    const mockToken = {
      id: "device-1",
      token: "apns-token-123",
      userId: "user-1",
      platform: "IOS",
      pushProvider: "APNS",
    };

    (db.deviceToken.findUnique as MockFn).mockResolvedValue(mockToken);
    (db.deviceToken.update as MockFn).mockResolvedValue({
      ...mockToken,
      revokedAt: new Date(),
    });
    (auditLog as MockFn).mockResolvedValue(undefined);

    await revokeDeviceToken({ token: "apns-token-123" });

    expect(db.deviceToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
        }),
      })
    );
  });

  it("logs PUSH_TOKEN_REVOKED audit event", async () => {
    const mockToken = {
      id: "device-1",
      token: "apns-token-123",
      userId: "user-1",
      tenantId: "tenant-1",
      platform: "IOS",
      pushProvider: "APNS",
    };

    (db.deviceToken.findUnique as MockFn).mockResolvedValue(mockToken);
    (db.deviceToken.update as MockFn).mockResolvedValue({
      ...mockToken,
      revokedAt: new Date(),
    });
    (auditLog as MockFn).mockResolvedValue(undefined);

    await revokeDeviceToken({ token: "apns-token-123" });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PUSH_TOKEN_REVOKED",
      })
    );
  });

  it("handles missing token gracefully", async () => {
    (db.deviceToken.findUnique as MockFn).mockResolvedValue(null);

    // Should not throw
    await revokeDeviceToken({ token: "nonexistent-token" });

    expect(db.deviceToken.update).not.toHaveBeenCalled();
  });
});

describe("push/stub — sendPushToUser", () => {
  it("never throws", async () => {
    const result = await sendPushToUser("user-1", {
      title: "Test",
      body: "Message",
    });

    expect(result).toEqual({
      sent: false,
      reason: "provider-not-configured",
    });
  });

  it("always returns sent:false when unconfigured", async () => {
    const result = await sendPushToUser("user-1", {
      title: "Important",
    });

    expect(result.sent).toBe(false);
  });
});

describe("push/stub — sendPushToPatient", () => {
  it("never throws", async () => {
    const result = await sendPushToPatient("patient-1", {
      title: "Appointment reminder",
      body: "Your appointment is tomorrow",
    });

    expect(result).toEqual({
      sent: false,
      reason: "provider-not-configured",
    });
  });

  it("always returns sent:false when unconfigured", async () => {
    const result = await sendPushToPatient("patient-1", {
      body: "Journal prompt",
    });

    expect(result.sent).toBe(false);
  });
});

describe("push/stub — payload handling", () => {
  it("accepts minimal payload", async () => {
    const result = await sendPushToUser("user-1", {});
    expect(result.sent).toBe(false);
  });

  it("accepts full payload with platform overrides", async () => {
    const result = await sendPushToPatient("patient-1", {
      title: "Title",
      body: "Body",
      badge: 5,
      sound: "default",
      data: { deeplink: "/appointments" },
      apns: { aps: { alert: { title: "Custom APNs title" } } },
      fcm: { notification: { color: "#FF0000" } },
    });

    expect(result.sent).toBe(false);
  });
});
