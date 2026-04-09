/**
 * Unit tests — Payments API (src/app/api/v1/payments/route.ts)
 * Tests: POST /api/v1/payments
 * - Full payment marks charge as PAID
 * - Partial payment creates "Saldo restante" charge
 * - Overpayment rejection
 * - Cannot pay PAID/VOID/REFUNDED charges
 * - Error handling
 */

// Mock all dependencies BEFORE any imports
import { vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    charge: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    payment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/tenant");
vi.mock("@/lib/rbac");
vi.mock("@/lib/audit");
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next-auth/providers/email", () => ({ default: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: vi.fn() } })) }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/v1/payments/route";
import { db } from "@/lib/db";
import * as tenantLib from "@/lib/tenant";
import * as rbacLib from "@/lib/rbac";
import * as auditLib from "@/lib/audit";

describe("Payments API", () => {
  const mockDb = db as jest.Mocked<typeof db>;
  const mockGetAuthContext = tenantLib.getAuthContext as jest.Mock;
  const mockRequirePermission = rbacLib.requirePermission as jest.Mock;
  const mockAuditLog = auditLib.auditLog as jest.Mock;
  const mockExtractRequestMeta = auditLib.extractRequestMeta as jest.Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockImplementation(() => {}); // Pass through
    mockAuditLog.mockResolvedValue({} as any);
    mockExtractRequestMeta.mockReturnValue({ ipAddress: "127.0.0.1", userAgent: "test" });
  });

  // ─── POST /api/v1/payments ────────────────────────────────────────────────

  describe("POST /api/v1/payments", () => {
    test("full payment marks charge as PAID", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const charge = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        tenantId: "tenant-456",
        patientId: "patient-789",
        amountCents: 10000,
        discountCents: 0,
        dueDate: new Date("2026-04-01"),
        status: "PENDING",
        payments: [],
        providerUserId: "provider-111",
      };

      // First call for pre-transaction check
      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      // Mock the transaction
      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const txMock = {
          charge: {
            findFirst: vi.fn().mockResolvedValueOnce(charge as any),
            update: vi.fn().mockResolvedValueOnce({
              id: "550e8400-e29b-41d4-a716-446655440001",
              status: "PAID",
            }),
          },
          payment: {
            create: vi.fn().mockResolvedValueOnce({
              id: "payment-001",
              tenantId: "tenant-456",
              chargeId: "550e8400-e29b-41d4-a716-446655440001",
              amountCents: 10000,
              method: "PIX",
              paidAt: new Date(),
            }),
          },
        };
        return await cb(txMock as any);
      });

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 10000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.data.payment.id).toBe("payment-001");
      expect(data.data.remainderCharge).toBeNull();
    });

    test("partial payment creates Saldo restante charge and marks original PAID", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const charge = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        tenantId: "tenant-456",
        patientId: "patient-789",
        amountCents: 10000,
        discountCents: 0,
        dueDate: new Date("2026-04-01"),
        status: "PENDING",
        payments: [],
        providerUserId: "provider-111",
        appointmentId: null,
        sessionId: null,
      };

      // First call for pre-transaction check
      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      // Mock transaction with partial payment logic
      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const txMock = {
          charge: {
            findFirst: vi.fn().mockResolvedValueOnce(charge as any),
            create: vi.fn().mockResolvedValueOnce({
              id: "charge-remainder",
              description: "Saldo restante",
              amountCents: 4000,
              status: "PENDING",
            }),
            update: vi.fn().mockResolvedValueOnce({
              id: "550e8400-e29b-41d4-a716-446655440001",
              status: "PAID",
            }),
          },
          payment: {
            create: vi.fn().mockResolvedValueOnce({
              id: "payment-partial",
              chargeId: "550e8400-e29b-41d4-a716-446655440001",
              amountCents: 6000,
            }),
          },
        };
        return await cb(txMock as any);
      });

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 6000,
        method: "CASH",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(data.data.remainderCharge.id).toBe("charge-remainder");
      expect(data.data.remainderCharge.description).toBe("Saldo restante");
      expect(data.data.remainderCharge.amountCents).toBe(4000);
    });

    test("respects discounts in balance calculation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const charge = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        tenantId: "tenant-456",
        patientId: "patient-789",
        amountCents: 10000,
        discountCents: 2000, // R$ 20 discount
        dueDate: new Date("2026-04-01"),
        status: "PENDING",
        payments: [],
        providerUserId: "provider-111",
        appointmentId: null,
        sessionId: null,
      };

      // First call for pre-transaction check
      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const txMock = {
          charge: {
            findFirst: vi.fn().mockResolvedValueOnce(charge as any),
            update: vi.fn().mockResolvedValueOnce({
              id: "550e8400-e29b-41d4-a716-446655440001",
              status: "PAID",
            }),
          },
          payment: {
            create: vi.fn().mockResolvedValueOnce({
              id: "payment-001",
              amountCents: 8000,
            }),
          },
        };
        return await cb(txMock as any);
      });

      // Net = 10000 - 2000 = 8000; payment of 8000 is full payment
      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 8000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
    });

    test("rejects overpayment", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const charge = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        tenantId: "tenant-456",
        patientId: "patient-789",
        amountCents: 10000,
        discountCents: 0,
        dueDate: new Date("2026-04-01"),
        status: "PENDING",
        payments: [],
        providerUserId: "provider-111",
      };

      // First call for pre-transaction check
      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      // Mock transaction that re-fetches and throws error
      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const txMock = {
          charge: {
            findFirst: vi.fn().mockResolvedValueOnce(charge as any),
          },
          payment: { create: vi.fn() },
        };
        return await cb(txMock as any);
      });

      // Trying to pay 15000 when only 10000 is owed
      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 15000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("saldo restante");
    });

    test("rejects payment on PAID charge", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const charge = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        status: "PAID",
        tenantId: "tenant-456",
        payments: [{ amountCents: 10000 }],
        amountCents: 10000,
        discountCents: 0,
      };

      // First call for pre-transaction check
      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      // Mock transaction that re-fetches and throws error
      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const txMock = {
          charge: {
            findFirst: vi.fn().mockResolvedValueOnce(charge as any),
          },
          payment: { create: vi.fn() },
        };
        return await cb(txMock as any);
      });

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 5000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("PAID");
    });

    test("rejects payment on VOID charge", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const charge = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        status: "VOID",
        tenantId: "tenant-456",
        payments: [],
        amountCents: 10000,
        discountCents: 0,
      };

      // First call for pre-transaction check
      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      // Mock transaction that re-fetches and throws error
      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const txMock = {
          charge: {
            findFirst: vi.fn().mockResolvedValueOnce(charge as any),
          },
          payment: { create: vi.fn() },
        };
        return await cb(txMock as any);
      });

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 5000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("VOID");
    });

    test("rejects payment on REFUNDED charge", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const charge = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        status: "REFUNDED",
        tenantId: "tenant-456",
        payments: [],
        amountCents: 10000,
        discountCents: 0,
      };

      // First call for pre-transaction check
      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      // Mock transaction that re-fetches and throws error
      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const txMock = {
          charge: {
            findFirst: vi.fn().mockResolvedValueOnce(charge as any),
          },
          payment: { create: vi.fn() },
        };
        return await cb(txMock as any);
      });

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 5000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.message).toContain("REFUNDED");
    });

    test("charge not found returns 404", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findFirst.mockResolvedValueOnce(null);

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440099",
        amountCents: 5000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
    });

    test("validates payment method enum", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 5000,
        method: "INVALID_METHOD",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    test("accepts all valid payment methods", async () => {
      const methods = ["PIX", "CASH", "CARD", "TRANSFER", "INSURANCE", "OTHER"];

      for (const method of methods) {
        vi.clearAllMocks();
        mockRequirePermission.mockImplementation(() => {});
        mockExtractRequestMeta.mockReturnValue({ ipAddress: "127.0.0.1", userAgent: "test" });
        mockAuditLog.mockResolvedValue({} as any);

        mockGetAuthContext.mockResolvedValueOnce({
          userId: "user-123",
          tenantId: "tenant-456",
          role: "ASSISTANT",
          membership: {},
          tenant: {},
        } as any);

        const charge = {
          id: "550e8400-e29b-41d4-a716-446655440001",
          tenantId: "tenant-456",
          patientId: "patient-789",
          amountCents: 10000,
          discountCents: 0,
          status: "PENDING",
          payments: [],
          providerUserId: "provider-111",
        };

        mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

        mockDb.$transaction.mockImplementationOnce(async (cb) => {
          const txMock = {
            charge: {
              findFirst: vi.fn().mockResolvedValueOnce(charge as any),
              update: vi.fn().mockResolvedValueOnce({
                id: "550e8400-e29b-41d4-a716-446655440001",
                status: "PAID",
              }),
            },
            payment: {
              create: vi.fn().mockResolvedValueOnce({
                id: "payment-001",
                method,
              }),
            },
          };
          return await cb(txMock as any);
        });

        const payload = {
          chargeId: "550e8400-e29b-41d4-a716-446655440001",
          amountCents: 10000,
          method,
        };

        const req = new NextRequest("http://localhost:3000/api/v1/payments", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const res = await POST(req);
        expect(res.status).toBe(201);
      }
    });

    test("audits payment creation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      const charge = {
        id: "550e8400-e29b-41d4-a716-446655440001",
        tenantId: "tenant-456",
        patientId: "patient-789",
        amountCents: 10000,
        discountCents: 0,
        status: "PENDING",
        payments: [],
        providerUserId: "provider-111",
      };

      // First call for pre-transaction check
      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        const txMock = {
          charge: {
            findFirst: vi.fn().mockResolvedValueOnce(charge as any),
            update: vi.fn().mockResolvedValueOnce({
              id: "550e8400-e29b-41d4-a716-446655440001",
              status: "PAID",
            }),
          },
          payment: {
            create: vi.fn().mockResolvedValueOnce({
              id: "payment-001",
              amountCents: 10000,
            }),
          },
        };
        return await cb(txMock as any);
      });

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 10000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await POST(req);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-456",
          userId: "user-123",
          action: "PAYMENT_CREATE",
          entity: "Payment",
          summary: expect.objectContaining({
            chargeId: "550e8400-e29b-41d4-a716-446655440001",
            amountCents: 10000,
            method: "PIX",
          }),
        })
      );
    });

    test("checks payments:create permission", async () => {
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
        chargeId: "550e8400-e29b-41d4-a716-446655440001",
        amountCents: 10000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "payments:create");
      expect(res.status).toBe(403);
    });

    test("respects tenant isolation for charge lookup", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "ASSISTANT",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findFirst.mockResolvedValueOnce(null);

      const payload = {
        chargeId: "550e8400-e29b-41d4-a716-446655440099",
        amountCents: 5000,
        method: "PIX",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await POST(req);

      expect(mockDb.charge.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-456",
          }),
        })
      );
      expect(res.status).toBe(404);
    });
  });
});
