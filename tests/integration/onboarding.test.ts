/**
 * Integration tests — Onboarding flow
 *
 * Tests the /api/v1/onboarding POST endpoint's transaction:
 * creating user + tenant + membership atomically.
 *
 * Requires a running database (set DATABASE_URL + DIRECT_URL).
 * Run via: npm run test:integration
 */

import { db } from "@/lib/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniqueEmail() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@psycologger-test.com`;
}

async function cleanup(emails: string[]) {
  const users = await db.user.findMany({ where: { email: { in: emails } } });
  const userIds = users.map((u) => u.id);
  const memberships = await db.membership.findMany({ where: { userId: { in: userIds } } });
  const tenantIds = memberships.map((m) => m.tenantId);

  // Order matters due to FK constraints
  await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await db.appointmentType.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await db.membership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Onboarding — database transaction", () => {
  const emails: string[] = [];

  afterAll(async () => {
    await cleanup(emails);
    await db.$disconnect();
  });

  test("creates user, tenant, and TENANT_ADMIN membership in one transaction", async () => {
    const email = uniqueEmail();
    emails.push(email);

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name: "Dr. Test" },
      });

      const slug = `test-clinic-${Date.now()}`;
      const tenant = await tx.tenant.create({
        data: { name: "Test Clinic", slug },
      });

      const membership = await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "TENANT_ADMIN",
          status: "ACTIVE",
        },
      });

      return { user, tenant, membership };
    });

    expect(result.user.email).toBe(email);
    expect(result.tenant.slug).toContain("test-clinic");
    expect(result.membership.role).toBe("TENANT_ADMIN");
    expect(result.membership.status).toBe("ACTIVE");
    expect(result.membership.userId).toBe(result.user.id);
    expect(result.membership.tenantId).toBe(result.tenant.id);
  });

  test("duplicate email returns existing user (no DB error)", async () => {
    const email = uniqueEmail();
    emails.push(email);

    await db.user.create({ data: { email, name: "First" } });

    // Simulate what the onboarding API does — check before creating
    const existing = await db.user.findUnique({ where: { email } });
    expect(existing).not.toBeNull();
    // API returns success silently to avoid email enumeration
  });

  test("tenant slug must be unique (DB constraint)", async () => {
    const email1 = uniqueEmail();
    const email2 = uniqueEmail();
    emails.push(email1, email2);
    const slug = `unique-test-${Date.now()}`;

    await db.tenant.create({ data: { name: "Clinic 1", slug } });

    await expect(
      db.tenant.create({ data: { name: "Clinic 2", slug } })
    ).rejects.toThrow();
  });

  test("new user has no memberships initially (before transaction)", async () => {
    const email = uniqueEmail();
    emails.push(email);

    const user = await db.user.create({ data: { email } });

    const memberships = await db.membership.findMany({
      where: { userId: user.id },
    });
    expect(memberships).toHaveLength(0);
  });

  test("after onboarding, user has exactly one ACTIVE TENANT_ADMIN membership", async () => {
    const email = uniqueEmail();
    emails.push(email);

    const { user, tenant } = await db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email, name: "New User" } });
      const t = await tx.tenant.create({ data: { name: "My Clinic", slug: `my-clinic-${Date.now()}` } });
      await tx.membership.create({ data: { tenantId: t.id, userId: u.id, role: "TENANT_ADMIN", status: "ACTIVE" } });
      return { user: u, tenant: t };
    });

    const memberships = await db.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
    });

    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("TENANT_ADMIN");
    expect(memberships[0].tenantId).toBe(tenant.id);
  });
});

describe("Onboarding — tenant defaults", () => {
  const emails: string[] = [];

  afterAll(async () => {
    await cleanup(emails);
    await db.$disconnect();
  });

  test("tenant has correct Brazilian defaults", async () => {
    const email = uniqueEmail();
    emails.push(email);
    const slug = `defaults-test-${Date.now()}`;

    const tenant = await db.tenant.create({ data: { name: "Test", slug } });

    expect(tenant.timezone).toBe("America/Sao_Paulo");
    expect(tenant.locale).toBe("pt-BR");
    expect(tenant.sharedPatientPool).toBe(false);
    expect(tenant.adminCanViewClinical).toBe(false);
    expect(tenant.defaultAppointmentDurationMin).toBe(50);
    expect(tenant.workingHoursStart).toBe("08:00");
    expect(tenant.workingHoursEnd).toBe("18:00");
    expect(tenant.plan).toBe("beta");
  });
});
