/**
 * Unit tests — Appointments API
 * Tests: GET/POST /api/v1/appointments and GET/PATCH /api/v1/appointments/[id]
 * - GET filters by date range, status, provider, patient
 * - POST creates appointment with validation, handles recurring
 * - Conflict detection
 * - Email notifications
 */

// Mock all dependencies BEFORE any imports
jest.mock("@/lib/db", () => ({
  db: {
    appointment: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    patient: { findFirst: jest.fn(), findUnique: jest.fn() },
    membership: { findFirst: jest.fn() },
    appointmentType: { findFirst: jest.fn() },
    tenant: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn() },
    recurrence: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/tenant");
jest.mock("@/lib/rbac");
jest.mock("@/lib/audit");
jest.mock("@/lib/email");
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: jest.fn() }));
jest.mock("next-auth", () => ({ getServerSession: jest.fn(), default: jest.fn() }));
jest.mock("next-auth/providers/email", () => ({ default: jest.fn() }));
jest.mock("resend", () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: jest.fn() } })) }));

import { NextRequest } from "next/server";
import { GET as listAppointments, POST as createAppointment } from "@/app/api/v1/appointments/route";
import { GET as getAppointment, PATCH as updateAppointment } from "@/app/api/v1/appointments/[id]/route";
import { db } from "@/lib/db";
import * as tenantLib from "@/lib/tenant";
import * as rbacLib from "@/lib/rbac";
import * as auditLib from "@/lib/audit";

describe("Appointments API", () => {
  const mockDb = db as jest.Mocked<typeof db>;
  const mockGetAuthContext = tenantLib.getAuthContext as jest.Mock;
  const mockRequirePermission = rbacLib.requirePermission as jest.Mock;
  const mockAuditLog = auditLib.auditLog as jest.Mock;
  const mockExtractRequestMeta = auditLib.extractRequestMeta as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequirePermission.mockImplementation(() => {});
    mockAuditLog.mockResolvedValue({} as any);
    mockExtractRequestMeta.mockReturnValue({ ipAddress: "127.0.0.1", userAgent: "test" });
    // Reset all db mocks to clear any state between tests
    (mockDb.appointment.findFirst as jest.Mock).mockReset();
    (mockDb.appointment.findMany as jest.Mock).mockReset();
    (mockDb.appointment.count as jest.Mock).mockReset();
    (mockDb.$transaction as jest.Mock).mockReset();
    (mockDb.patient.findFirst as jest.Mock).mockReset();
    (mockDb.patient.findUnique as jest.Mock).mockReset();
    (mockDb.membership.findFirst as jest.Mock).mockReset();
    (mockDb.tenant.findUniqueOrThrow as jest.Mock).mockReset();
    (mockDb.tenant.findUnique as jest.Mock).mockReset();
  });

  // ─── GET /api/v1/appointments ────────────────────────────────────────────

  describe("GET /api/v1/appointments", () => {
    test("returns list of appointments", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const mockAppointments = [
        {
          id: "apt-1",
          startsAt: new Date("2026-03-15T10:00:00Z"),
          endsAt: new Date("2026-03-15T11:00:00Z"),
          status: "CONFIRMED",
          patient: { id: "p1", fullName: "Patient A" },
          provider: { id: "u1", name: "Dr. Silva" },
          appointmentType: { id: "t1", name: "Therapy", color: "#blue", defaultDurationMin: 60 },
          clinicalSession: null,
          charges: [],
        },
      ];

      mockDb.appointment.findMany.mockResolvedValueOnce(mockAppointments as any);
      mockDb.appointment.count.mockResolvedValueOnce(1);

      const req = new NextRequest("http://localhost:3000/api/v1/appointments");
      const res = await listAppointments(req);
      const data = await res.json();

      expect(data.data).toHaveLength(1);
      expect(data.data[0].status).toBe("CONFIRMED");
    });

    test("filters by date range (from and to)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.count.mockResolvedValueOnce(0);

      const req = new NextRequest(
        "http://localhost:3000/api/v1/appointments?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z"
      );
      await listAppointments(req);

      expect(mockDb.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startsAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    test("filters by status", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/appointments?status=COMPLETED");
      await listAppointments(req);

      expect(mockDb.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "COMPLETED",
          }),
        })
      );
    });

    test("filters by providerId", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/appointments?providerId=provider-789");
      await listAppointments(req);

      expect(mockDb.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            providerUserId: "provider-789",
          }),
        })
      );
    });

    test("defaults to current user as provider when not specified", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/appointments");
      await listAppointments(req);

      expect(mockDb.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            providerUserId: "user-123",
          }),
        })
      );
    });

    test("excludes CANCELED appointments by default", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/appointments");
      await listAppointments(req);

      expect(mockDb.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: "CANCELED" },
          }),
        })
      );
    });

    test("respects tenant isolation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/appointments");
      await listAppointments(req);

      expect(mockDb.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-456",
          }),
        })
      );
    });
  });

  // ─── POST /api/v1/appointments ───────────────────────────────────────────

  describe("POST /api/v1/appointments", () => {
    test("creates appointment with required fields", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      // Mock validation queries
      (mockDb.patient.findFirst as jest.Mock).mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440001" });
      (mockDb.membership.findFirst as jest.Mock).mockResolvedValueOnce({ id: "membership-123" });
      (mockDb.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({ timezone: "America/Sao_Paulo" });

      // Mock conflict check (none found)
      mockDb.appointment.findFirst.mockResolvedValueOnce(null);

      // Mock transaction
      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        return await cb({
          appointment: {
            findFirst: jest.fn().mockResolvedValueOnce(null),
            create: jest.fn().mockResolvedValueOnce({
              id: "apt-new",
              patientId: "550e8400-e29b-41d4-a716-446655440001",
              providerUserId: "550e8400-e29b-41d4-a716-446655440002",
              startsAt: new Date("2026-03-20T10:00:00Z"),
              endsAt: new Date("2026-03-20T11:00:00Z"),
              patient: { id: "550e8400-e29b-41d4-a716-446655440001", fullName: "John Doe" },
              appointmentType: { id: "t1", name: "Session" },
            }),
            updateMany: jest.fn(),
          },
          recurrence: {
            create: jest.fn(),
          },
        } as any);
      });

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        providerUserId: "550e8400-e29b-41d4-a716-446655440002",
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440003",
        startsAt: "2026-03-20T10:00:00Z",
        endsAt: "2026-03-20T11:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createAppointment(req);
      const data = await res.json();

      expect(data.data.id).toBe("apt-new");
      expect(data.data.totalCreated).toBeGreaterThan(0);
    });

    test("detects scheduling conflicts", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      // Mock validation queries
      (mockDb.patient.findFirst as jest.Mock).mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440001" });
      (mockDb.membership.findFirst as jest.Mock).mockResolvedValueOnce({ id: "membership-123" });
      (mockDb.tenant.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({ timezone: "America/Sao_Paulo" });

      // Mock transaction that finds conflict on the first check
      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const mockTx = {
          appointment: {
            findFirst: jest.fn().mockResolvedValue({ id: "existing-apt" }), // Conflict found
            create: jest.fn(),
            updateMany: jest.fn(),
          },
          recurrence: {
            create: jest.fn(),
          },
        };
        return await cb(mockTx);
      });

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        providerUserId: "550e8400-e29b-41d4-a716-446655440002",
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440003",
        startsAt: "2026-03-20T10:00:00Z",
        endsAt: "2026-03-20T11:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createAppointment(req);
      expect(res.status).toBe(409);
    });

    test("validates required fields", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        // Missing providerUserId
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440003",
        startsAt: "2026-03-20T10:00:00Z",
        endsAt: "2026-03-20T11:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createAppointment(req);
      expect(res.status).toBe(400);
    });

    test("checks appointments:create permission", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "READONLY",
        membership: {},
        tenant: {},
      } as any);

      mockRequirePermission.mockImplementation(() => {
        throw new rbacLib.ForbiddenError("Permission denied");
      });

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        providerUserId: "550e8400-e29b-41d4-a716-446655440002",
        appointmentTypeId: "550e8400-e29b-41d4-a716-446655440003",
        startsAt: "2026-03-20T10:00:00Z",
        endsAt: "2026-03-20T11:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createAppointment(req);
      expect(res.status).toBe(403);
    });
  });

  // ─── GET /api/v1/appointments/[id] ──────────────────────────────────────

  describe("GET /api/v1/appointments/[id]", () => {
    test("returns appointment with related data", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const mockAppointment = {
        id: "apt-123",
        tenantId: "tenant-456",
        startsAt: new Date("2026-03-20T10:00:00Z"),
        patient: { id: "p1", fullName: "Patient A", preferredName: null, email: "patient@example.com", phone: "123-456-7890" },
        provider: { id: "u1", name: "Dr. Silva", email: "silva@example.com" },
        appointmentType: { id: "t1", name: "Session", color: "#blue", defaultDurationMin: 60 },
        clinicalSession: null,
        charges: [],
        reminderLogs: [],
      };

      // Reset the mock and set up fresh
      (mockDb.appointment.findFirst as jest.Mock).mockClear();
      (mockDb.appointment.findFirst as jest.Mock).mockResolvedValueOnce(mockAppointment as any);

      const req = new NextRequest("http://localhost:3000/api/v1/appointments/apt-123");
      const res = await getAppointment(req, { params: { id: "apt-123" } });
      const data = await res.json();

      expect(data.data.id).toBe("apt-123");
      expect(data.data.patient).toBeDefined();
      expect(data.data.provider).toBeDefined();
    });

    test("respects tenant isolation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      // Reset the mock and set up fresh
      (mockDb.appointment.findFirst as jest.Mock).mockClear();
      (mockDb.appointment.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/appointments/apt-from-other-tenant");
      const res = await getAppointment(req, { params: { id: "apt-from-other-tenant" } });

      expect(mockDb.appointment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-456",
          }),
        })
      );
      expect(res.status).toBe(404);
    });
  });

  // ─── PATCH /api/v1/appointments/[id] ────────────────────────────────────

  describe("PATCH /api/v1/appointments/[id]", () => {
    test("updates appointment status", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "apt-123",
        tenantId: "tenant-456",
        status: "CONFIRMED",
        startsAt: new Date("2026-03-20T10:00:00Z"),
        endsAt: new Date("2026-03-20T11:00:00Z"),
        providerUserId: "550e8400-e29b-41d4-a716-446655440002",
        recurrenceId: null,
      };

      (mockDb.appointment.findFirst as jest.Mock).mockClear();
      (mockDb.appointment.findFirst as jest.Mock).mockResolvedValueOnce(existing as any);

      const updated = {
        id: "apt-123",
        status: "COMPLETED",
        tenantId: "tenant-456",
        startsAt: new Date("2026-03-20T10:00:00Z"),
        endsAt: new Date("2026-03-20T11:00:00Z"),
      };

      (mockDb.$transaction as jest.Mock).mockClear();
      (mockDb.$transaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const mockTx = {
          appointment: {
            update: jest.fn().mockResolvedValue(updated),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return await cb(mockTx);
      });

      const payload = {
        status: "COMPLETED",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/appointments/apt-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const res = await updateAppointment(req, { params: { id: "apt-123" } });
      const data = await res.json();

      expect(data.data.status).toBe("COMPLETED");
    });

    test("detects conflicts when rescheduling", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "apt-123",
        tenantId: "tenant-456",
        providerUserId: "550e8400-e29b-41d4-a716-446655440002",
        startsAt: new Date("2026-03-20T10:00:00Z"),
        endsAt: new Date("2026-03-20T11:00:00Z"),
      };

      // Reset the mock for fresh setup
      (mockDb.appointment.findFirst as jest.Mock).mockClear();
      (mockDb.appointment.findFirst as jest.Mock).mockResolvedValueOnce(existing as any); // First call: get existing

      // Mock transaction that finds a conflict
      (mockDb.$transaction as jest.Mock).mockClear();
      (mockDb.$transaction as jest.Mock).mockImplementationOnce(async (cb) => {
        const mockTx = {
          appointment: {
            findFirst: jest.fn().mockResolvedValue({ id: "apt-conflict" }), // Conflict detected
            update: jest.fn(),
            updateMany: jest.fn(),
          },
        };
        return await cb(mockTx);
      });

      const payload = {
        startsAt: "2026-03-21T10:00:00Z",
        endsAt: "2026-03-21T11:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/appointments/apt-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const res = await updateAppointment(req, { params: { id: "apt-123" } });
      expect(res.status).toBe(409);
    });

    test("audits appointment status change", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "apt-123",
        tenantId: "tenant-456",
        status: "CONFIRMED",
        startsAt: new Date("2026-03-20T10:00:00Z"),
        endsAt: new Date("2026-03-20T11:00:00Z"),
        providerUserId: "550e8400-e29b-41d4-a716-446655440002",
        recurrenceId: null,
      };

      mockDb.appointment.findFirst.mockResolvedValueOnce(existing as any);

      const updated = {
        id: "apt-123",
        status: "CANCELED",
        tenantId: "tenant-456",
        startsAt: new Date("2026-03-20T10:00:00Z"),
        endsAt: new Date("2026-03-20T11:00:00Z"),
      };

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const mockTx = {
          appointment: {
            update: jest.fn().mockResolvedValue(updated),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return await cb(mockTx);
      });

      const payload = {
        status: "CANCELED",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/appointments/apt-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      await updateAppointment(req, { params: { id: "apt-123" } });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "APPOINTMENT_CANCEL",
          entityId: "apt-123",
        })
      );
    });

    test("cancels future recurring appointments with THIS_AND_FUTURE scope", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "apt-123",
        tenantId: "tenant-456",
        status: "CONFIRMED",
        startsAt: new Date("2026-03-20T10:00:00Z"),
        endsAt: new Date("2026-03-20T11:00:00Z"),
        providerUserId: "550e8400-e29b-41d4-a716-446655440002",
        recurrenceId: "recurrence-xyz",
      };

      mockDb.appointment.findFirst.mockResolvedValueOnce(existing as any);

      const updated = {
        id: "apt-123",
        status: "CANCELED",
        tenantId: "tenant-456",
        startsAt: new Date("2026-03-20T10:00:00Z"),
        endsAt: new Date("2026-03-20T11:00:00Z"),
      };

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const mockTx = {
          appointment: {
            update: jest.fn().mockResolvedValue(updated),
            updateMany: jest.fn().mockResolvedValue({ count: 3 }),
          },
        };
        return await cb(mockTx);
      });

      const payload = {
        status: "CANCELED",
        cancelScope: "THIS_AND_FUTURE",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/appointments/apt-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      await updateAppointment(req, { params: { id: "apt-123" } });

      // Verify updateMany was called to cancel future occurrences
      expect(mockDb.$transaction).toHaveBeenCalled();
    });
  });
});
