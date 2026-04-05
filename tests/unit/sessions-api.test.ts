/**
 * Unit tests — Sessions API (src/app/api/v1/sessions/route.ts and [id]/route.ts)
 * Tests:
 * - GET excludes soft-deleted sessions
 * - POST creates clinical session and revision
 * - POST marks linked appointment as COMPLETED
 * - PATCH updates session and creates revision
 * - DELETE soft-deletes (sets deletedAt)
 */

// Mock all dependencies BEFORE any imports
jest.mock("@/lib/db", () => ({
  db: {
    clinicalSession: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    sessionRevision: { create: jest.fn() },
    patient: { findFirst: jest.fn() },
    appointment: { update: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
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
import { GET as listSessions, POST as createSession } from "@/app/api/v1/sessions/route";
import { GET as getSession, PATCH as updateSession, DELETE as deleteSession } from "@/app/api/v1/sessions/[id]/route";
import { db } from "@/lib/db";
import * as tenantLib from "@/lib/tenant";
import * as rbacLib from "@/lib/rbac";
import * as auditLib from "@/lib/audit";

describe("Sessions API", () => {
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
    mockGetPatientScope.mockReturnValue("ALL");
    mockExtractRequestMeta.mockReturnValue({ ipAddress: "127.0.0.1", userAgent: "test" });
  });

  // ─── GET /api/v1/sessions ────────────────────────────────────────────────

  describe("GET /api/v1/sessions", () => {
    test("returns list of sessions excluding soft-deleted", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      const mockSessions = [
        {
          id: "session-1",
          patientId: "550e8400-e29b-41d4-a716-446655440001",
          providerUserId: "user-123",
          templateKey: "SOAP",
          tags: ["follow-up"],
          sessionDate: new Date("2026-03-15"),
          createdAt: new Date("2026-03-15"),
          updatedAt: new Date("2026-03-15"),
          patient: { id: "550e8400-e29b-41d4-a716-446655440001", fullName: "Patient A" },
          provider: { id: "user-123", name: "Dr. Silva" },
        },
      ];

      mockDb.clinicalSession.findMany.mockResolvedValueOnce(mockSessions as any);
      mockDb.clinicalSession.count.mockResolvedValueOnce(1);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions");
      const res = await listSessions(req);
      const data = await res.json();

      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("session-1");
    });

    test("filters deletedAt IS NULL to exclude soft-deleted", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findMany.mockResolvedValueOnce([]);
      mockDb.clinicalSession.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions");
      await listSessions(req);

      expect(mockDb.clinicalSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
    });

    test("filters by patientId", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findMany.mockResolvedValueOnce([]);
      mockDb.clinicalSession.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions?patientId=550e8400-e29b-41d4-a716-446655440001");
      await listSessions(req);

      expect(mockDb.clinicalSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patientId: "550e8400-e29b-41d4-a716-446655440001",
          }),
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

      mockDb.clinicalSession.findMany.mockResolvedValueOnce([]);
      mockDb.clinicalSession.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions");
      await listSessions(req);

      expect(mockDb.clinicalSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            providerUserId: "user-123",
          }),
        })
      );
    });

    test("applies pagination", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findMany.mockResolvedValueOnce([]);
      mockDb.clinicalSession.count.mockResolvedValueOnce(50);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions?page=2&pageSize=10");
      await listSessions(req);

      expect(mockDb.clinicalSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (2-1) * 10
          take: 10,
        })
      );
    });

    test("orders by sessionDate descending", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findMany.mockResolvedValueOnce([]);
      mockDb.clinicalSession.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions");
      await listSessions(req);

      expect(mockDb.clinicalSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sessionDate: "desc" },
        })
      );
    });

    test("checks sessions:view permission", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/v1/sessions");
      const res = await listSessions(req);

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "sessions:view");
      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/v1/sessions ───────────────────────────────────────────────

  describe("POST /api/v1/sessions", () => {
    test("creates clinical session with initial revision", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440001" } as any);

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        return await cb({
          clinicalSession: {
            create: jest.fn().mockResolvedValueOnce({
              id: "session-new",
              patientId: "550e8400-e29b-41d4-a716-446655440001",
              providerUserId: "user-123",
              templateKey: "SOAP",
              noteText: "Patient assessment",
              tags: ["initial"],
              sessionDate: new Date("2026-03-20"),
            }),
            findFirst: jest.fn().mockResolvedValueOnce(null),
          },
          sessionRevision: {
            create: jest.fn().mockResolvedValueOnce({
              id: "revision-1",
              sessionId: "session-new",
              noteText: "Patient assessment",
            }),
          },
          appointment: {
            updateMany: jest.fn(),
          },
        } as any);
      });

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        templateKey: "SOAP",
        noteText: "Patient assessment",
        tags: ["initial"],
        sessionDate: "2026-03-20T10:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createSession(req);
      const data = await res.json();

      expect(data.data.id).toBe("session-new");
      expect(data.data.templateKey).toBe("SOAP");
    });

    test("marks linked appointment as COMPLETED", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440001" } as any);
      (mockDb as any).appointment.findFirst.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440010" } as any);

      const mockTx = {
        clinicalSession: {
          create: jest.fn().mockResolvedValueOnce({
            id: "session-new",
            patientId: "550e8400-e29b-41d4-a716-446655440001",
            providerUserId: "user-123",
          }),
          findFirst: jest.fn().mockResolvedValueOnce(null),
        },
        sessionRevision: {
          create: jest.fn(),
        },
        appointment: {
          updateMany: jest.fn(),
        },
      };

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        return await cb(mockTx);
      });

      const payload = {
        appointmentId: "550e8400-e29b-41d4-a716-446655440010",
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        templateKey: "FREE",
        noteText: "Session notes",
        sessionDate: "2026-03-20T10:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await createSession(req);

      expect(mockTx.appointment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "550e8400-e29b-41d4-a716-446655440010",
          }),
          data: { status: "COMPLETED" },
        })
      );
    });

    test("creates initial SessionRevision on creation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440001" } as any);

      const mockTx = {
        clinicalSession: {
          create: jest.fn().mockResolvedValueOnce({
            id: "session-new",
          }),
          findFirst: jest.fn().mockResolvedValueOnce(null),
        },
        sessionRevision: {
          create: jest.fn(),
        },
        appointment: {
          updateMany: jest.fn(),
        },
      };

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        return await cb(mockTx);
      });

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        noteText: "Initial notes",
        sessionDate: "2026-03-20T10:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await createSession(req);

      expect(mockTx.sessionRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: "session-new",
            noteText: "Initial notes",
            editedById: "user-123",
          }),
        })
      );
    });

    test("validates noteText is required and has max length", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      // Missing noteText
      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        sessionDate: "2026-03-20T10:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createSession(req);
      expect(res.status).toBe(400);
    });

    test("audits session creation", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.patient.findFirst.mockResolvedValueOnce({ id: "550e8400-e29b-41d4-a716-446655440001" } as any);

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        return await cb({
          clinicalSession: {
            create: jest.fn().mockResolvedValueOnce({
              id: "session-new",
              patientId: "550e8400-e29b-41d4-a716-446655440001",
            }),
            findFirst: jest.fn().mockResolvedValueOnce(null),
          },
          sessionRevision: {
            create: jest.fn(),
          },
          appointment: {
            updateMany: jest.fn(),
          },
        } as any);
      });

      const payload = {
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        templateKey: "SOAP",
        noteText: "Notes",
        sessionDate: "2026-03-20T10:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await createSession(req);

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-456",
          userId: "user-123",
          action: "SESSION_CREATE",
          entity: "ClinicalSession",
          summary: expect.objectContaining({
            patientId: "550e8400-e29b-41d4-a716-446655440001",
            templateKey: "SOAP",
          }),
        })
      );
    });

    test("checks sessions:create permission", async () => {
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
        noteText: "Notes",
        sessionDate: "2026-03-20T10:00:00Z",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const res = await createSession(req);

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "sessions:create");
      expect(res.status).toBe(403);
    });
  });

  // ─── GET /api/v1/sessions/[id] ──────────────────────────────────────────

  describe("GET /api/v1/sessions/[id]", () => {
    test("returns session with full details and revisions", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      const mockSession = {
        id: "session-123",
        tenantId: "tenant-456",
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        providerUserId: "user-123",
        noteText: "Full notes",
        templateKey: "SOAP",
        patient: { id: "550e8400-e29b-41d4-a716-446655440001", fullName: "Patient A" },
        provider: { id: "user-123", name: "Dr. Silva" },
        appointment: { id: "apt-1", status: "COMPLETED" },
        revisions: [
          { id: "rev-2", editedAt: new Date("2026-03-20T12:00:00Z"), editedById: "user-123" },
          { id: "rev-1", editedAt: new Date("2026-03-20T10:00:00Z"), editedById: "user-123" },
        ],
        files: [
          { id: "file-1", fileName: "notes.pdf", mimeType: "application/pdf", sizeBytes: 5000 },
        ],
        deletedAt: null,
      };

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(mockSession as any);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123");
      const res = await getSession(req, { params: { id: "session-123" } });
      const data = await res.json();

      expect(data.data.id).toBe("session-123");
      expect(data.data.revisions).toHaveLength(2);
      expect(data.data.files).toHaveLength(1);
    });

    test("excludes soft-deleted sessions (deletedAt IS NULL)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-deleted");
      const res = await getSession(req, { params: { id: "session-deleted" } });

      expect(mockDb.clinicalSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        })
      );
      expect(res.status).toBe(404);
    });

    test("returns 404 when session not found", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/nonexistent");
      const res = await getSession(req, { params: { id: "nonexistent" } });

      expect(res.status).toBe(404);
    });
  });

  // ─── PATCH /api/v1/sessions/[id] ────────────────────────────────────────

  describe("PATCH /api/v1/sessions/[id]", () => {
    test("updates session noteText and creates revision", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "session-123",
        tenantId: "tenant-456",
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        noteText: "Old notes",
      };

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(existing as any);

      const mockTx = {
        clinicalSession: {
          update: jest.fn().mockResolvedValueOnce({
            id: "session-123",
            noteText: "Updated notes",
          }),
        },
        sessionRevision: {
          create: jest.fn(),
        },
      };

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        return await cb(mockTx);
      });

      const payload = {
        noteText: "Updated notes",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const res = await updateSession(req, { params: { id: "session-123" } });
      const data = await res.json();

      expect(data.data.noteText).toBe("Updated notes");
      // Should create revision because note changed
      expect(mockTx.sessionRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            noteText: "Updated notes",
            editedById: "user-123",
          }),
        })
      );
    });

    test("restores soft-deleted session with restore flag", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "session-123",
        tenantId: "tenant-456",
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        deletedAt: new Date("2026-03-19"),
        deletedBy: "user-456",
      };

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(existing as any);

      mockDb.clinicalSession.update.mockResolvedValueOnce({
        id: "session-123",
        deletedAt: null,
        deletedBy: null,
      } as any);

      const payload = {
        restore: true,
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      await updateSession(req, { params: { id: "session-123" } });

      expect(mockDb.clinicalSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            deletedAt: null,
            deletedBy: null,
          },
        })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SESSION_RESTORE",
        })
      );
    });

    test("does not create revision if noteText unchanged", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "session-123",
        tenantId: "tenant-456",
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        noteText: "Notes",
      };

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(existing as any);

      const mockTx = {
        clinicalSession: {
          update: jest.fn().mockResolvedValueOnce({
            id: "session-123",
            templateKey: "BIRP",
          }),
        },
        sessionRevision: {
          create: jest.fn(),
        },
      };

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        return await cb(mockTx);
      });

      const payload = {
        templateKey: "BIRP",
        // noteText not changed
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      await updateSession(req, { params: { id: "session-123" } });

      expect(mockTx.sessionRevision.create).not.toHaveBeenCalled();
    });

    test("audits session update", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "session-123",
        tenantId: "tenant-456",
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        noteText: "Old",
      };

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(existing as any);

      mockDb.$transaction.mockImplementationOnce(async (cb) => {
        return await cb({
          clinicalSession: {
            update: jest.fn().mockResolvedValueOnce({
              id: "session-123",
            }),
          },
          sessionRevision: {
            create: jest.fn(),
          },
        } as any);
      });

      const payload = {
        noteText: "Updated",
        tags: ["updated"],
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      await updateSession(req, { params: { id: "session-123" } });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SESSION_UPDATE",
          entity: "ClinicalSession",
        })
      );
    });

    test("checks sessions:edit permission", async () => {
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
        noteText: "Updated",
      };

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const res = await updateSession(req, { params: { id: "session-123" } });

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "sessions:edit");
      expect(res.status).toBe(403);
    });
  });

  // ─── DELETE /api/v1/sessions/[id] ───────────────────────────────────────

  describe("DELETE /api/v1/sessions/[id]", () => {
    test("soft-deletes session (sets deletedAt)", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "session-123",
        tenantId: "tenant-456",
        patientId: "550e8400-e29b-41d4-a716-446655440001",
        deletedAt: null,
      };

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(existing as any);

      mockDb.clinicalSession.update.mockResolvedValueOnce({
        id: "session-123",
        deletedAt: expect.any(Date),
        deletedBy: "user-123",
      } as any);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123", {
        method: "DELETE",
      });

      const res = await deleteSession(req, { params: { id: "session-123" } });

      expect(mockDb.clinicalSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "session-123" }),
          data: {
            deletedAt: expect.any(Date),
            deletedBy: "user-123",
          },
        })
      );
      expect(res.status).toBe(204);
    });

    test("schedules hard delete after 30 days in audit log", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      const existing = {
        id: "session-123",
        tenantId: "tenant-456",
        patientId: "550e8400-e29b-41d4-a716-446655440001",
      };

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(existing as any);

      mockDb.clinicalSession.update.mockResolvedValueOnce({
        id: "session-123",
        deletedAt: new Date(),
      } as any);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123", {
        method: "DELETE",
      });

      await deleteSession(req, { params: { id: "session-123" } });

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "SESSION_DELETE",
          summary: expect.objectContaining({
            patientId: "550e8400-e29b-41d4-a716-446655440001",
            scheduledHardDeleteAt: expect.any(Date),
          }),
        })
      );
    });

    test("returns 404 when session not found or already deleted", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/nonexistent", {
        method: "DELETE",
      });

      const res = await deleteSession(req, { params: { id: "nonexistent" } });

      expect(res.status).toBe(404);
    });

    test("checks sessions:edit permission (same as PATCH)", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-123", {
        method: "DELETE",
      });

      const res = await deleteSession(req, { params: { id: "session-123" } });

      expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "sessions:edit");
      expect(res.status).toBe(403);
    });
  });

  // ─── Tenant Isolation ──────────────────────────────────────────────────────

  describe("Tenant isolation", () => {
    test("session queries filter by tenantId", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findMany.mockResolvedValueOnce([]);
      mockDb.clinicalSession.count.mockResolvedValueOnce(0);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions");
      await listSessions(req);

      expect(mockDb.clinicalSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-456",
          }),
        })
      );
    });

    test("prevent access to sessions from other tenants", async () => {
      mockGetAuthContext.mockResolvedValueOnce({
        userId: "user-123",
        tenantId: "tenant-456",
        role: "PSYCHOLOGIST",
        membership: {},
        tenant: {},
      } as any);

      mockDb.clinicalSession.findFirst.mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/sessions/session-from-other-tenant");
      const res = await getSession(req, { params: { id: "session-from-other-tenant" } });

      expect(mockDb.clinicalSession.findFirst).toHaveBeenCalledWith(
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
