/**
 * Unit tests — Patients API (src/app/api/v1/patients/route.ts and [id]/route.ts)
 * Tests:
 * - GET /api/v1/patients (list with pagination, search, filters)
 * - POST /api/v1/patients (create with validation)
 * - GET /api/v1/patients/[id]
 * - PATCH /api/v1/patients/[id]
 * - DELETE /api/v1/patients/[id] (soft delete)
 */

// Mock all dependencies BEFORE any imports
jest.mock("@/lib/db", () => ({
  db: {
    patient: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
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
import { GET as listPatients, POST as createPatient } from "@/app/api/v1/patients/route";
import { GET as getPatient, PATCH as updatePatient, DELETE as deletePatient } from "@/app/api/v1/patients/[id]/route";
import { db } from "@/lib/db";
import * as tenantLib from "@/lib/tenant";
import * as rbacLib from "@/lib/rbac";
import * as auditLib from "@/lib/audit";

describe("Patients API", () => {
  const mockDb = db as jest.Mocked<typeof db>;
  const mockGetAuthContext = tenantLib.getAuthContext as jest.Mock;
  const mockRequirePermission = rbacLib.requirePermission as jest.Mock;
  const mockGetPatientScope = rbacLib.getPatientScope as jest.Mock;
  const mockAuditLog = auditLib.auditLog as jest.Mock;
  const mockExtractRequestMeta = auditLib.extractRequestMeta as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequirePermission.mockImplementation(() => {});
    mockAuditLog.mockResolvedValue({} as any);
    mockGetPatientScope.mockReturnValue("ALL"); // Default scope
    mockExtractRequestMeta.mockReturnValue({ ipAddress: "127.0.0.1", userAgent: "test" });
  });

  // ─── GET /api/v1/patients ─────────────────────────────────────────────────

  describe("GET /api/v1/patients", () => {
    test("returns list of patients with pagination", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const mockPatients = [
        {
          id: "p1",
          fullName: "Patient A",
          preferredName: "A",
          email: "a@example.com",
          phone: "1111111111",
          isActive: true,
          tenantId: "tenant-456",
          assignedUser: { id: "u1", name: "Dr. Silva" },
          _count: { appointments: 5, charges: 2 },
        },
      ];

      mockDb.patient.findMany.mockResolvedValueOnce(mockPatients as any);
      mockDb.patient.count.mockResolvedValueOnce(1);

      const req = new NextRequest("http://localhost:3000/api/v1/patients");
      const res = await listPatients(req);
      const data = await res.json();

      expect(data.data).toHaveLength(1);
      expect(data.data[0].fullName).toBe("Patient A");
      expect(data.meta.total).toBe(1);
      expect(data.meta.hasMore).toBe(false);
    });

    test("filters by search query (fullName, preferredName, email, phone)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/patients?q=john");
      await listPatients(req);

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ fullName: { contains: "john", mode: "insensitive" } }),
              expect.objectContaining({ preferredName: { contains: "john", mode: "insensitive" } }),
              expect.objectContaining({ email: { contains: "john", mode: "insensitive" } }),
              expect.objectContaining({ phone: { contains: "john", mode: "insensitive" } }),
            ]),
          }),
        })
      );
    });

    test("filters by active status", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/patients?active=false");
      await listPatients(req);

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        })
      );
    });

    test("filters by tag", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/patients?tag=vip");
      await listPatients(req);

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tags: { has: "vip" } }),
        })
      );
    });

    test("respects ASSIGNED patient scope", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);
      mockGetPatientScope.mockReturnValueOnce("ASSIGNED");

      mockDb.patient.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/patients");
      await listPatients(req);

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assignedUserId: "user-123" }),
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

      mockDb.patient.findMany.mockResolvedValueOnce([]);
      mockDb.patient.count.mockResolvedValueOnce(100);

      const req = new NextRequest("http://localhost:3000/api/v1/patients?page=3&pageSize=10");
      await listPatients(req);

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        })
      );
    });

    test("checks patients:list permission", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/v1/patients");
      const res = await listPatients(req);

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "patients:list");
      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/v1/patients ────────────────────────────────────────────────

  describe("POST /api/v1/patients", () => {
    test("creates patient with provided data", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const newPatient = {
        id: "p-new",
        tenantId: "tenant-456",
        fullName: "João Silva",
        preferredName: "João",
        email: "joao@example.com",
        phone: "99999999999",
        dob: new Date("1990-05-15"),
        notes: "Hypertension",
        tags: ["vip", "regular"],
        isActive: true,
      };

      mockDb.patient.create.mockResolvedValueOnce(newPatient as any);

      const payload = {
        fullName: "João Silva",
        preferredName: "João",
        email: "joao@example.com",
        phone: "99999999999",
        dob: "1990-05-15",
        notes: "Hypertension",
        tags: ["vip", "regular"],
      };

      const req = new NextRequest("http://localhost:3000/api/v1/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createPatient(req);
      const data = await res.json();

      expect(data.data.id).toBe("p-new");
      expect(data.data.fullName).toBe("João Silva");
      expect(mockDb.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-456",
            fullName: "João Silva",
            preferredName: "João",
            tags: ["vip", "regular"],
          }),
        })
      );
    });

    test("assigns to current user by default", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.create.mockResolvedValueOnce({ id: "p-new" } as any);

      const payload = {
        fullName: "Patient Name",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await createPatient(req);

      expect(mockDb.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedUserId: "user-123",
          }),
        })
      );
    });

    test("accepts explicit assignedUserId", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.create.mockResolvedValueOnce({ id: "p-new" } as any);

      const payload = {
        fullName: "Patient Name",
        assignedUserId: "550e8400-e29b-41d4-a716-446655440099",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await createPatient(req);

      expect(mockDb.patient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedUserId: "550e8400-e29b-41d4-a716-446655440099",
          }),
        })
      );
    });

    test("validates fullName is required", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const payload = {};

      const req = new NextRequest("http://localhost:3000/api/v1/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createPatient(req);
      expect(res.status).toBe(400);
    });

    test("audits patient creation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.create.mockResolvedValueOnce({ id: "p-new" } as any);

      const payload = {
        fullName: "João Silva",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await createPatient(req);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-456",
          userId: "user-123",
          action: "PATIENT_CREATE",
          entity: "Patient",
        })
      );
    });

    test("checks patients:create permission", async () => {
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
        fullName: "Patient Name",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createPatient(req);
      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "patients:create");
      expect(res.status).toBe(403);
    });
  });

  // ─── GET /api/v1/patients/[id] ────────────────────────────────────────────

  describe("GET /api/v1/patients/[id]", () => {
    test("returns patient by ID", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      const mockPatient = {
        id: "p-123",
        fullName: "Patient",
        tenantId: "tenant-456",
        assignedUser: { id: "u1", name: "Dr. Silva" },
        contacts: [],
      };

      mockDb.patient.findFirst.mockResolvedValueOnce(mockPatient as any);

      const req = new NextRequest("http://localhost:3000/api/v1/patients/p-123");
      const res = await getPatient(req, { params: { id: "p-123" } });
      const data = await res.json();

      expect(data.data.id).toBe("p-123");
    });

    test("respects tenant isolation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/patients/p-from-other-tenant");
      const res = await getPatient(req, { params: { id: "p-from-other-tenant" } });

      expect(mockDb.patient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-456",
          }),
        })
      );
      expect(res.status).toBe(404);
    });

    test("returns 404 when patient not found", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/patients/nonexistent");
      const res = await getPatient(req, { params: { id: "nonexistent" } });

      expect(res.status).toBe(404);
    });
  });

  // ─── PATCH /api/v1/patients/[id] ──────────────────────────────────────────

  describe("PATCH /api/v1/patients/[id]", () => {
    test("updates patient data", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({
        id: "p-123",
        tenantId: "tenant-456",
      } as any);

      const updated = {
        id: "p-123",
        fullName: "Updated Name",
      };

      mockDb.patient.update.mockResolvedValueOnce(updated as any);

      const payload = {
        fullName: "Updated Name",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/patients/p-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const res = await updatePatient(req, { params: { id: "p-123" } });
      const data = await res.json();

      expect(data.data.fullName).toBe("Updated Name");
    });

    test("soft-deletes patient when isActive set to false", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({
        id: "p-123",
        tenantId: "tenant-456",
      } as any);

      mockDb.patient.update.mockResolvedValueOnce({
        id: "p-123",
        isActive: false,
        archivedAt: new Date(),
        archivedBy: "user-123",
      } as any);

      const payload = {
        isActive: false,
      };

      const req = new NextRequest("http://localhost:3000/api/v1/patients/p-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const res = await updatePatient(req, { params: { id: "p-123" } });

      expect(mockDb.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            archivedAt: expect.any(Date),
            archivedBy: "user-123",
          }),
        })
      );
    });

    test("audits patient update", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({
        id: "p-123",
        tenantId: "tenant-456",
      } as any);

      mockDb.patient.update.mockResolvedValueOnce({ id: "p-123" } as any);

      const payload = {
        fullName: "Updated",
        email: "new@example.com",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/patients/p-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      await updatePatient(req, { params: { id: "p-123" } });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PATIENT_UPDATE",
          entity: "Patient",
        })
      );
    });
  });

  // ─── DELETE /api/v1/patients/[id] ─────────────────────────────────────────

  describe("DELETE /api/v1/patients/[id]", () => {
    test("soft-deletes patient", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({
        id: "p-123",
        tenantId: "tenant-456",
      } as any);

      mockDb.patient.update.mockResolvedValueOnce({ id: "p-123" } as any);

      const req = new NextRequest("http://localhost:3000/api/v1/patients/p-123", {
        method: "DELETE",
      });

      const res = await deletePatient(req, { params: { id: "p-123" } });

      expect(mockDb.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            archivedAt: expect.any(Date),
            archivedBy: "user-123",
          }),
        })
      );
      expect(res.status).toBe(204);
    });

    test("audits patient archive", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "TENANT_ADMIN",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({
        id: "p-123",
        tenantId: "tenant-456",
      } as any);

      mockDb.patient.update.mockResolvedValueOnce({ id: "p-123" } as any);

      const req = new NextRequest("http://localhost:3000/api/v1/patients/p-123", {
        method: "DELETE",
      });

      await deletePatient(req, { params: { id: "p-123" } });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PATIENT_ARCHIVE",
        })
      );
    });

    test("checks patients:archive permission", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/v1/patients/p-123", {
        method: "DELETE",
      });

      const res = await deletePatient(req, { params: { id: "p-123" } });

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "patients:archive");
      expect(res.status).toBe(403);
    });
  });
});
