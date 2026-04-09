/**
 * Unit tests — Reports API (src/app/api/v1/reports/route.ts)
 * Tests: GET /api/v1/reports
 * - Dashboard report with summary, byProvider, byMethod
 * - Cashflow report (last N months)
 * - Previsibility report (upcoming + overdue)
 * - CSV exports (patients, appointments, charges)
 * - Cash vs accrual basis calculations
 */

// Mock all dependencies BEFORE any imports
import { vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    charge: { findMany: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
    payment: { findMany: vi.fn(), aggregate: vi.fn() },
    appointment: { findMany: vi.fn(), count: vi.fn() },
    patient: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/tenant");
vi.mock("@/lib/rbac");
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(), default: vi.fn() }));
vi.mock("next-auth/providers/email", () => ({ default: vi.fn() }));
vi.mock("resend", () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: vi.fn() } })) }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/reports/route";
import { db } from "@/lib/db";
import * as tenantLib from "@/lib/tenant";
import * as rbacLib from "@/lib/rbac";

describe("Reports API", () => {
  const mockDb = db as jest.Mocked<typeof db>;
  const mockGetAuthContext = tenantLib.getAuthContext as jest.Mock;
  const mockRequirePermission = rbacLib.requirePermission as jest.Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockImplementation(() => {});
  });

  // Note: Reports API doesn't use extractRequestMeta, so no need to mock it

  // ─── Dashboard Report ─────────────────────────────────────────────────────

  describe("GET /api/v1/reports (dashboard type)", () => {
    test("returns dashboard summary for month", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([
        {
          id: "charge-1",
          amountCents: 10000,
          discountCents: 0,
          status: "PAID",
          dueDate: new Date("2026-03-01"),
          description: "Service",
          payments: [{ amountCents: 10000 }],
          provider: { name: "Dr. Silva", email: "silva@example.com", id: "u1" },
          providerUserId: "u1",
          patient: { fullName: "Patient A" },
        },
      ] as any);

      mockDb.payment.findMany.mockResolvedValueOnce([
        {
          amountCents: 10000,
          method: "PIX",
          charge: {
            provider: { id: "u1", name: "Dr. Silva" },
            providerUserId: "u1",
          },
        },
      ] as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([
        {
          id: "apt-1",
          status: "COMPLETED",
          startsAt: new Date("2026-03-15"),
          provider: { id: "u1", name: "Dr. Silva" },
        },
      ] as any);

      mockDb.patient.count.mockResolvedValueOnce(1); // New patients

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=dashboard&year=2026&month=3");
      const res = await GET(req);
      const data = await res.json();

      expect(data.data.summary).toBeDefined();
      expect(data.data.summary.totalCharged).toBe(10000); // R$ 100.00
      expect(data.data.summary.totalCaixa).toBe(10000);
      expect(data.data.apptStats).toBeDefined();
      expect(data.data.byProvider).toBeDefined();
      expect(data.data.byMethod).toBeDefined();
    });

    test("calculates cash basis (payments received in month)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([]);

      // Payment received in March, but charge was due in February
      mockDb.payment.findMany.mockResolvedValueOnce([
        {
          amountCents: 5000,
          method: "CASH",
          paidAt: new Date("2026-03-15"),
          charge: {
            provider: { id: "u1", name: "Dr. Silva" },
            dueDate: new Date("2026-02-01"),
          },
        },
      ] as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=dashboard&year=2026&month=3");
      const res = await GET(req);
      const data = await res.json();

      // Payment received in March should count toward March cash
      expect(data.data.summary.totalCaixa).toBe(5000);
    });

    test("excludes Saldo restante from totalCharged", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([
        {
          id: "charge-1",
          amountCents: 10000,
          discountCents: 0,
          status: "PAID",
          description: "Service",
          payments: [{ amountCents: 10000 }],
          provider: { name: "Dr. Silva", email: "silva@example.com", id: "u1" },
          providerUserId: "u1",
          patient: { fullName: "Patient A" },
        },
        {
          id: "charge-2",
          amountCents: 3000,
          discountCents: 0,
          status: "PENDING",
          description: "Saldo restante", // Split payment
          payments: [],
          provider: { name: "Dr. Silva", email: "silva@example.com", id: "u1" },
          providerUserId: "u1",
          patient: { fullName: "Patient A" },
        },
      ] as any);

      mockDb.payment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=dashboard&year=2026&month=3");
      const res = await GET(req);
      const data = await res.json();

      // Should only count original 10000, not the remainder
      expect(data.data.summary.totalCharged).toBe(10000);
    });

    test("respects PSYCHOLOGIST role (filters by providerUserId)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-456",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([]);
      mockDb.payment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=dashboard&year=2026&month=3");
      await GET(req);

      // Should filter payments by provider
      expect(mockDb.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            charge: { providerUserId: "user-456" },
          }),
        })
      );
    });
  });

  // ─── Cashflow Report ──────────────────────────────────────────────────────

  describe("GET /api/v1/reports (cashflow type)", () => {
    test("returns last 6 months of data", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      // Mock 6 months of aggregates
      mockDb.charge.aggregate.mockResolvedValue({
        _sum: { amountCents: 10000, discountCents: 0 },
      } as any);

      mockDb.payment.aggregate.mockResolvedValue({
        _sum: { amountCents: 8000 },
      } as any);

      mockDb.appointment.count.mockResolvedValue(4);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=cashflow&year=2026&month=3&months=6");
      const res = await GET(req);
      const data = await res.json();

      expect(data.data.cashflow).toBeDefined();
      expect(data.data.cashflow).toHaveLength(6);
    });

    test("includes competencia and caixa for each month", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.aggregate.mockResolvedValue({
        _sum: { amountCents: 10000, discountCents: 2000 },
      } as any);

      mockDb.payment.aggregate.mockResolvedValue({
        _sum: { amountCents: 5000 },
      } as any);

      mockDb.appointment.count.mockResolvedValue(3);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=cashflow&year=2026&month=3&months=1");
      const res = await GET(req);
      const data = await res.json();

      expect(data.data.cashflow[0].competencia).toBe(8000); // 10000 - 2000
      expect(data.data.cashflow[0].caixa).toBe(5000);
      expect(data.data.cashflow[0].sessions).toBe(3);
    });
  });

  // ─── Previsibility Report ──────────────────────────────────────────────────

  describe("GET /api/v1/reports (previsibility type)", () => {
    test("returns upcoming charges and overdue", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      // Three calls for upcoming months, one for overdue
      mockDb.charge.aggregate
        .mockResolvedValueOnce({
          _sum: { amountCents: 5000, discountCents: 0 },
        } as any) // Upcoming month 1
        .mockResolvedValueOnce({
          _sum: { amountCents: 0, discountCents: 0 },
        } as any) // Upcoming month 2
        .mockResolvedValueOnce({
          _sum: { amountCents: 0, discountCents: 0 },
        } as any) // Upcoming month 3
        .mockResolvedValueOnce({
          _sum: { amountCents: 3000, discountCents: 0 },
        } as any); // Overdue

      mockDb.charge.count
        .mockResolvedValueOnce(2) // Upcoming month 1
        .mockResolvedValueOnce(0) // Upcoming month 2
        .mockResolvedValueOnce(0) // Upcoming month 3
        .mockResolvedValueOnce(1); // Overdue

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=previsibility&year=2026&month=3");
      const res = await GET(req);
      const data = await res.json();

      expect(data.data.upcoming).toBeDefined();
      expect(data.data.overdue).toBeDefined();
      expect(data.data.overdue.total).toBe(3000);
    });
  });

  // ─── CSV Exports ──────────────────────────────────────────────────────────

  describe("GET /api/v1/reports (CSV exports)", () => {
    test("exports patients as CSV", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findMany.mockResolvedValueOnce([
        {
          fullName: "João Silva",
          preferredName: "João",
          email: "joao@example.com",
          phone: "99999999999",
          dob: new Date("1990-05-15"),
          tags: ["vip", "active"],
          consentGiven: true,
          createdAt: new Date("2026-01-01"),
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=patients");
      const res = await GET(req);
      const text = await res.text();

      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(text).toContain("Nome completo");
      expect(text).toContain("João Silva");
      expect(res.headers.get("Content-Disposition")).toContain("pacientes.csv");
    });

    test("exports appointments as CSV", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([
        {
          startsAt: new Date("2026-03-15T10:00:00Z"),
          endsAt: new Date("2026-03-15T11:00:00Z"),
          patient: { fullName: "Patient A" },
          provider: { name: "Dr. Silva", email: "silva@example.com" },
          appointmentType: { name: "Therapy" },
          status: "COMPLETED",
          location: "Room 101",
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=appointments");
      const res = await GET(req);
      const text = await res.text();

      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(text).toContain("Data");
      expect(text).toContain("Tipo");
      expect(res.headers.get("Content-Disposition")).toContain("consultas.csv");
    });

    test("exports charges as CSV", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([
        {
          dueDate: new Date("2026-03-01"),
          amountCents: 10000,
          discountCents: 0,
          status: "PAID",
          description: "Session",
          patient: { fullName: "Patient A" },
          provider: { name: "Dr. Silva", email: "silva@example.com" },
          payments: [
            {
              amountCents: 10000,
              method: "PIX",
              paidAt: new Date("2026-03-15"),
            },
          ],
        },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=charges");
      const res = await GET(req);
      const text = await res.text();

      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(text).toContain("Vencimento");
      expect(text).toContain("100,00"); // 10000 cents formatted with Brazilian locale
      expect(res.headers.get("Content-Disposition")).toContain("cobrancas.csv");
    });

    test("respects PSYCHOLOGIST role in CSV exports", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-456",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.appointment.findMany.mockResolvedValueOnce([]);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=appointments");
      await GET(req);

      // Should filter by provider
      expect(mockDb.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            providerUserId: "user-456",
          }),
        })
      );
    });
  });

  // ─── Authorization ────────────────────────────────────────────────────────

  describe("Authorization", () => {
    test("checks reports:view permission", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=dashboard");
      const res = await GET(req);

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "reports:view");
      expect(res.status).toBe(403);
    });

    test("throws UnauthorizedError when not authenticated", async () => {
      mockGetAuthContext.mockRejectedValueOnce(new rbacLib.UnauthorizedError());

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=dashboard");
      const res = await GET(req);

      expect(res.status).toBe(401);
    });

    test("respects tenant isolation in all reports", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.charge.findMany.mockResolvedValueOnce([]);
      mockDb.payment.findMany.mockResolvedValueOnce([]);
      mockDb.appointment.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/reports?type=dashboard&year=2026&month=3");
      await GET(req);

      // All queries should filter by tenantId
      expect(mockDb.charge.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-456",
          }),
        })
      );
      expect(mockDb.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-456",
          }),
        })
      );
    });
  });
});
