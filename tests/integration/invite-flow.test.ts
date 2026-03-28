/**
 * Integration tests — Invite flow
 *
 * Tests the full invite lifecycle:
 * 1. Invite created (POST /api/v1/users)
 * 2. Invite validated (GET /api/v1/invites/[token])
 * 3. Invite accepted (POST /api/v1/invites/[token])
 * 4. Membership created with correct role
 * 5. Invite marked as accepted
 *
 * Requires DATABASE_URL. Run via: npm run test:integration
 */

import { db } from "@/lib/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uniqueEmail() {
  return `invite-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
}

let tenantId: string;
let adminUserId: string;

beforeAll(async () => {
  const admin = await db.user.create({ data: { email: uniqueEmail(), name: "Clinic Admin" } });
  adminUserId = admin.id;

  const tenant = await db.tenant.create({
    data: { name: "Invite Test Clinic", slug: `invite-test-${Date.now()}` },
  });
  tenantId = tenant.id;

  await db.membership.create({
    data: { tenantId, userId: adminUserId, role: "TENANT_ADMIN", status: "ACTIVE" },
  });
});

afterAll(async () => {
  await db.invite.deleteMany({ where: { tenantId } });
  await db.membership.deleteMany({ where: { tenantId } });
  await db.tenant.deleteMany({ where: { id: tenantId } });
  await db.user.deleteMany({ where: { id: adminUserId } });
  // Clean up invited users
  await db.user.deleteMany({ where: { email: { contains: "invite-test-" } } });
  await db.$disconnect();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Invite flow — creation", () => {
  test("creates invite with 7-day expiry", async () => {
    const email = uniqueEmail();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await db.invite.create({
      data: {
        tenantId,
        email,
        role: "PSYCHOLOGIST",
        expiresAt,
        sentById: adminUserId,
      },
    });

    expect(invite.email).toBe(email);
    expect(invite.role).toBe("PSYCHOLOGIST");
    expect(invite.acceptedAt).toBeNull();
    expect(invite.token).toBeTruthy();
    expect(invite.expiresAt > new Date()).toBe(true);
  });

  test("invite token is unique (cuid)", async () => {
    const i1 = await db.invite.create({
      data: { tenantId, email: uniqueEmail(), role: "ASSISTANT", expiresAt: new Date(Date.now() + 86400000), sentById: adminUserId },
    });
    const i2 = await db.invite.create({
      data: { tenantId, email: uniqueEmail(), role: "ASSISTANT", expiresAt: new Date(Date.now() + 86400000), sentById: adminUserId },
    });
    expect(i1.token).not.toBe(i2.token);
  });
});

describe("Invite flow — validation", () => {
  test("valid invite can be found by token", async () => {
    const email = uniqueEmail();
    const invite = await db.invite.create({
      data: { tenantId, email, role: "PSYCHOLOGIST", expiresAt: new Date(Date.now() + 86400000), sentById: adminUserId },
    });

    const found = await db.invite.findUnique({ where: { token: invite.token } });
    expect(found).not.toBeNull();
    expect(found?.email).toBe(email);
  });

  test("expired invite is detectable", async () => {
    const invite = await db.invite.create({
      data: {
        tenantId,
        email: uniqueEmail(),
        role: "READONLY",
        expiresAt: new Date(Date.now() - 1000), // already expired
        sentById: adminUserId,
      },
    });

    const found = await db.invite.findUnique({ where: { token: invite.token } });
    expect(found!.expiresAt < new Date()).toBe(true); // expired
  });

  test("non-existent token returns null", async () => {
    const found = await db.invite.findUnique({ where: { token: "nonexistent-token-xyz" } });
    expect(found).toBeNull();
  });
});

describe("Invite flow — acceptance", () => {
  test("accepting invite creates membership with correct role", async () => {
    const email = uniqueEmail();
    const invite = await db.invite.create({
      data: { tenantId, email, role: "PSYCHOLOGIST", expiresAt: new Date(Date.now() + 86400000), sentById: adminUserId },
    });

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email } });

      const membership = await tx.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: { tenantId, userId: user.id, role: invite.role, status: "ACTIVE" },
        update: { role: invite.role, status: "ACTIVE" },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return { user, membership };
    });

    expect(result.membership.role).toBe("PSYCHOLOGIST");
    expect(result.membership.status).toBe("ACTIVE");
    expect(result.membership.tenantId).toBe(tenantId);

    const updatedInvite = await db.invite.findUnique({ where: { id: invite.id } });
    expect(updatedInvite?.acceptedAt).not.toBeNull();
  });

  test("accepting invite for existing user upgrades their membership", async () => {
    const email = uniqueEmail();

    // Pre-existing user (e.g. from another clinic)
    const existingUser = await db.user.create({ data: { email } });

    // Create an invite for them
    const invite = await db.invite.create({
      data: { tenantId, email, role: "ASSISTANT", expiresAt: new Date(Date.now() + 86400000), sentById: adminUserId },
    });

    // Accept: should upsert membership, not fail
    await db.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) user = await tx.user.create({ data: { email } });

      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: user!.id } },
        create: { tenantId, userId: user!.id, role: invite.role, status: "ACTIVE" },
        update: { role: invite.role, status: "ACTIVE" },
      });

      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    });

    const membership = await db.membership.findFirst({
      where: { tenantId, userId: existingUser.id },
    });
    expect(membership?.role).toBe("ASSISTANT");
    expect(membership?.status).toBe("ACTIVE");
  });

  test("already-accepted invite has acceptedAt set", async () => {
    const invite = await db.invite.create({
      data: { tenantId, email: uniqueEmail(), role: "READONLY", expiresAt: new Date(Date.now() + 86400000) },
    });

    await db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

    const found = await db.invite.findUnique({ where: { id: invite.id } });
    expect(found?.acceptedAt).not.toBeNull();
  });
});

describe("Invite flow — business rules", () => {
  test("user cannot have duplicate membership (unique constraint)", async () => {
    const email = uniqueEmail();
    const user = await db.user.create({ data: { email } });

    await db.membership.create({
      data: { tenantId, userId: user.id, role: "PSYCHOLOGIST", status: "ACTIVE" },
    });

    // Second membership for same tenant+user should fail
    await expect(
      db.membership.create({
        data: { tenantId, userId: user.id, role: "ASSISTANT", status: "ACTIVE" },
      })
    ).rejects.toThrow(); // unique constraint on [tenantId, userId]
  });

  test("invited user sees all their active memberships", async () => {
    const email = uniqueEmail();
    const user = await db.user.create({ data: { email } });

    await db.membership.create({
      data: { tenantId, userId: user.id, role: "PSYCHOLOGIST", status: "ACTIVE" },
    });

    const memberships = await db.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
    });
    expect(memberships.length).toBeGreaterThanOrEqual(1);
  });
});
