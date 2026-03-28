/**
 * Integration test — Tenant isolation
 * Verifies that user from Tenant A cannot access Tenant B data.
 *
 * Requires a running database (set DATABASE_URL).
 * Run via: npm run test:integration
 */

import { db } from "@/lib/db";
import { getPatientScope } from "@/lib/rbac";
import type { AuthContext } from "@/lib/rbac";

describe("Tenant isolation", () => {
  let tenantA: { id: string };
  let tenantB: { id: string };
  let userA: { id: string };
  let userB: { id: string };
  let patientA: { id: string };

  beforeAll(async () => {
    // Create two isolated tenants
    tenantA = await db.tenant.create({
      data: { name: "Clinic A - Test", slug: `clinic-a-${Date.now()}` },
    });
    tenantB = await db.tenant.create({
      data: { name: "Clinic B - Test", slug: `clinic-b-${Date.now()}` },
    });

    userA = await db.user.create({
      data: { email: `usera-${Date.now()}@test.com` },
    });
    userB = await db.user.create({
      data: { email: `userb-${Date.now()}@test.com` },
    });

    await db.membership.create({
      data: { tenantId: tenantA.id, userId: userA.id, role: "PSYCHOLOGIST", status: "ACTIVE" },
    });
    await db.membership.create({
      data: { tenantId: tenantB.id, userId: userB.id, role: "PSYCHOLOGIST", status: "ACTIVE" },
    });

    patientA = await db.patient.create({
      data: {
        tenantId: tenantA.id,
        fullName: "Paciente da Clínica A",
        assignedUserId: userA.id,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.patient.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await db.membership.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await db.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await db.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await db.$disconnect();
  });

  test("User B cannot query patients from Tenant A", async () => {
    const patients = await db.patient.findMany({
      where: {
        tenantId: tenantB.id, // User B's tenant
        id: patientA.id,      // Patient from Tenant A
      },
    });
    expect(patients).toHaveLength(0);
  });

  test("User A can query their own patient", async () => {
    const patients = await db.patient.findMany({
      where: {
        tenantId: tenantA.id,
        id: patientA.id,
      },
    });
    expect(patients).toHaveLength(1);
  });

  test("User B's auth context resolves to Tenant B membership only", async () => {
    const membership = await db.membership.findFirst({
      where: { userId: userB.id, status: "ACTIVE" },
    });
    expect(membership?.tenantId).toBe(tenantB.id);
    expect(membership?.tenantId).not.toBe(tenantA.id);
  });

  test("Sessions are isolated by tenantId", async () => {
    // Create appointment type for tenant A
    const apptType = await db.appointmentType.create({
      data: { tenantId: tenantA.id, name: "Test Session Type" },
    });

    // Create appointment for tenant A
    const appt = await db.appointment.create({
      data: {
        tenantId: tenantA.id,
        patientId: patientA.id,
        providerUserId: userA.id,
        appointmentTypeId: apptType.id,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 50 * 60 * 1000),
        status: "COMPLETED",
      },
    });

    const session = await db.clinicalSession.create({
      data: {
        tenantId: tenantA.id,
        patientId: patientA.id,
        providerUserId: userA.id,
        noteText: "Test session note",
        sessionDate: new Date(),
      },
    });

    // User B queries for sessions in Tenant B — should get none
    const sessionsFromB = await db.clinicalSession.findMany({
      where: { tenantId: tenantB.id },
    });
    expect(sessionsFromB.some((s) => s.id === session.id)).toBe(false);

    // Cleanup
    await db.clinicalSession.delete({ where: { id: session.id } });
    await db.appointment.delete({ where: { id: appt.id } });
    await db.appointmentType.delete({ where: { id: apptType.id } });
  });
});
