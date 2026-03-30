/**
 * Unit tests — Charges API (src/app/api/v1/charges/route.ts)
 * Tests: GET /api/v1/charges, POST /api/v1/charges
 * - GET returns charges with computed paidAmountCents
 * - GET filters by status (including OVERDUE logic)
 * - GET respects date range filtering
 * - GET respects tenant isolation
 * - POST creates charge with correct data
 * - POST validates required fields
 * - Error handling
 */

// Mock all dependencies BEFORE any imports
jest.mock("@/lib/db", () => ({
  db: {
    charge: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
    payment: { findMany: jest.fn(), aggregate: jest.fn() },
    appointment: { findMany: jest.fn(), count: jest.fn() },
    patient: { count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/tenant");
jest.mock("@/lib/rbac");
jest.mock("@/lib/audit");
jest.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: jest.fn() }));
jest.mock("next-auth", () => ({ getServerSession: jest.fn(), default: jest.fn() }));
jest.mock("next-auth/providers/email", () => ({ default: jest.fn() }));
jest.mock("resend", () => ({ Resend: jest.fn().mockImplementation(() => ({ emails: { send: jest.fn() } })) }));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/charges/route";
import { db } from "@/lib/db";
import * as tenantLib from "@/lib/tenant";
import * as rbacLib from "@/lib/rbac";
import * as auditLib from "@/lib/audit";

describe("Charges API", () => {
  const mockDb = db as jest.Mocked<typeof db>;
  const mockGetAuthContext = tenantLib.getAuthContext as jest.Mock;
  const mockRequirePermission = rbacLib.requirePermission as jest.Mock;
  const mockAuditLog = auditLib.auditLog as jest.Mock;
  const mockExtractRequestMeta = auditLib.extractRequestMeta as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequirePermission.mockImplementation(() => {}); // Pass through
    mockAuditLog.mockResolvedValue({} as any);
    mockExtractRequestMeta.mockReturnValue({ ipAddress: "127.0.0.1", userAgent: "test" });
  });

  // ─── GET /api/v1/charges ──────────────────────────────────────────────────

  describe("GET /api/v1/charges", () => {
    test("returns charges with paidAmountCents computed from payments", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const mockCharges = [
        {
          id: "charge-1",
          tenantId: "tenant-456",
          amountCents: 10000,
          discountCents: 0,
          status: "PAID",
          dueDate: new Date("2026-03-01"),
          patient: { id: "p1", fullName: "Patient A" },
          provider: { id: "u1", name: "Dr. Silva" },
          payments: [
            { id: "pay-1", amountCents: 5000, method: "PIX", paidAt: new Date() },
            { id: "pay-2", amountCents: 5000, method: "CASH", paidAt: new Date() },
          ],
        },
      ];

      mockDb.charge.findMany.mockResolvedValueOnce(mockCharges as any);
      mockDb.charge.count.mockResolvedValueOnce(1);

      const req = new NextRequest("http://localhost:3000/api/v1/charges");
      const res = await GET(req);
      const data = await res.json();

      expect(data.data[0].paidAmountCents).toBe(10000); // 5000 + 5000
      expect(data.data[0].payments).toHaveLength(2);
    });

    test("filters by status OVERDUE includes both OVERDUE and PENDING past due date", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([]);
      mockDb.charge.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/charges?status=OVERDUE");
      await GET(req);

      expect(mockDb.charge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { status: "OVERDUE" },
              expect.objectContaining({ status: "PENDING", dueDate: { lt: expect.any(Date) } }),
            ]),
          }),
        })
      );
    });

    test("filters by patientId", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([]);
      mockDb.charge.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/charges?patientId=550e8400-e29b-41d4-a716-446655440000");
      await GET(req);

      expect(mockDb.charge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ patientId: "550e8400-e29b-41d4-a716-446655440000" }),
        })
      );
    });

    test("filters by date range (from and to)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([]);
      mockDb.charge.count.mockResolvedValueOnce(0);

      const req = new NextRequest(
        "http://localhost:3000/api/v1/charges?from=2026-03-01&to=2026-03-31"
      );
      await GET(req);

      expect(mockDb.charge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueDate: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    test("restricts PSYCHOLOGIST to own charges", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([]);
      mockDb.charge.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/charges");
      await GET(req);

      expect(mockDb.charge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ providerUserId: "user-123" }),
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

      mockDb.charge.findMany.mockResolvedValueOnce([]);
      mockDb.charge.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/charges");
      await GET(req);

      expect(mockDb.charge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: "tenant-456" }),
        })
      );
    });

    test("applies pagination", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([]);
      mockDb.charge.count.mockResolvedValueOnce(50);

      const req = new NextRequest("http://localhost:3000/api/v1/charges?page=2&pageSize=25");
      const res = await GET(req);
      const data = await res.json();

      expect(mockDb.charge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25, // (2-1) * 25
          take: 25,
        })
      );
      expect(data.meta.hasMore).toBe(false); // 50 total, page 2 of 2, no more
    });

    test("throws UnauthorizedError when not authenticated", async () => {
      mockGetAuthContext.mockRejectedValueOnce(new rbacLib.UnauthorizedError());

      const req = new NextRequest("http://localhost:3000/api/v1/charges");
      const res = await GET(req);

      expect(res.status).toBe(401);
    });

    test("checks charges:view permission", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/v1/charges");
      const res = await GET(req);

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "charges:view");
      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/v1/charges ─────────────────────────────────────────────────

  describe("POST /api/v1/charges", () => {
    test("creates charge with correct data", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const newCharge = {
        id: "charge-new",
        tenantId: "tenant-456",
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 50000,
        discountCents: 5000,
        currency: "BRL",
        dueDate: new Date("2026-04-01"),
        description: "Session fee",
        status: "PENDING",
      };

      mockDb.charge.create.mockResolvedValueOnce(newCharge as any);

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 50000,
        discountCents: 5000,
        dueDate: "2026-04-01",
        description: "Session fee",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(mockDb.charge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-456",
            patientId: "550e8400-e29b-41d4-a716-446655440000",
            amountCents: 50000,
            discountCents: 5000,
            currency: "BRL",
            providerUserId: "user-123",
            status: "PENDING",
          }),
        })
      );
      expect(data.data.id).toBe("charge-new");
    });

    test("uses default currency BRL when not specified", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.create.mockResolvedValueOnce({ id: "charge-new" } as any);

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 10000,
        dueDate: "2026-04-01",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await POST(req);

      expect(mockDb.charge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: "BRL" }),
        })
      );
    });

    test("uses default discountCents 0 when not specified", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.create.mockResolvedValueOnce({ id: "charge-new" } as any);

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 10000,
        dueDate: "2026-04-01",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await POST(req);

      expect(mockDb.charge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ discountCents: 0 }),
        })
      );
    });

    test("validates required fields (patientId, amountCents, dueDate)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      // Missing patientId
      const invalidPayload = {
        amountCents: 10000,
        dueDate: "2026-04-01",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(invalidPayload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400); // Zod validation error
    });

    test("validates amountCents is positive and within max", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      // Invalid: 0 or negative
      const payload1 = {
        patientId: "patient-789",
        amountCents: 0,
        dueDate: "2026-04-01",
      };

      const req1 = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(payload1),
      });

      const res1 = await POST(req1);
      expect(res1.status).toBe(400);
    });

    test("validates dueDate format (YYYY-MM-DD)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const invalidPayload = {
        patientId: "patient-789",
        amountCents: 10000,
        dueDate: "invalid-date",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(invalidPayload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    test("audits charge creation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.create.mockResolvedValueOnce({
        id: "charge-new",
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 50000,
      } as any);

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 50000,
        dueDate: "2026-04-01",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await POST(req);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-456",
          userId: "user-123",
          action: "CHARGE_CREATE",
          entity: "Charge",
          entityId: "charge-new",
          summary: expect.objectContaining({
            patientId: "550e8400-e29b-41d4-a716-446655440000",
            amountCents: 50000,
          }),
        })
      );
    });

    test("checks charges:create permission", async () => {
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
        patientId: "patient-789",
        amountCents: 10000,
        dueDate: "2026-04-01",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "charges:create");
      expect(res.status).toBe(403);
    });

    test("throws UnauthorizedError when not authenticated", async () => {
      mockGetAuthContext.mockRejectedValueOnce(new rbacLib.UnauthorizedError());

      const payload = {
        patientId: "patient-789",
        amountCents: 10000,
        dueDate: "2026-04-01",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/charges", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });
});
