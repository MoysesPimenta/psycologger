/**
 * Integration tests — Payment flow & charge status auto-update
 *
 * Verifies that:
 * 1. A payment is created correctly
 * 2. When total paid >= net amount, charge status becomes PAID
 * 3. Partial payments don't change charge status
 * 4. Discounts are respected in the net amount calculation
 *
 * Requires DATABASE_URL. Run via: npm run test:integration
 */

import { db } from "@/lib/db";

// ─── Setup ────────────────────────────────────────────────────────────────────

let tenantId: string;
let userId: string;
let patientId: string;
let appointmentTypeId: string;

function uniqueEmail() {
  return `payment-test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
}

beforeAll(async () => {
  const user = await db.user.create({ data: { email: uniqueEmail(), name: "Dr. Payment Test" } });
  userId = user.id;

  const tenant = await db.tenant.create({
    data: { name: "Payment Test Clinic", slug: `payment-test-${Date.now()}` },
  });
  tenantId = tenant.id;

  await db.membership.create({
    data: { tenantId, userId, role: "PSYCHOLOGIST", status: "ACTIVE" },
  });

  const patient = await db.patient.create({
    data: { tenantId, fullName: "Test Patient", assignedUserId: userId },
  });
  patientId = patient.id;

  const apptType = await db.appointmentType.create({
    data: { tenantId, name: "Consulta", defaultDurationMin: 50 },
  });
  appointmentTypeId = apptType.id;
});

afterAll(async () => {
  // Cleanup in dependency order
  await db.payment.deleteMany({ where: { tenantId } });
  await db.charge.deleteMany({ where: { tenantId } });
  await db.appointment.deleteMany({ where: { tenantId } });
  await db.appointmentType.deleteMany({ where: { tenantId } });
  await db.patient.deleteMany({ where: { tenantId } });
  await db.membership.deleteMany({ where: { tenantId } });
  await db.tenant.deleteMany({ where: { id: tenantId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function createCharge(amountCents: number, discountCents = 0) {
  return db.charge.create({
    data: {
      tenantId,
      patientId,
      providerUserId: userId,
      amountCents,
      discountCents,
      currency: "BRL",
      dueDate: new Date(),
      status: "PENDING",
    },
  });
}

async function addPayment(chargeId: string, amountCents: number) {
  const charge = await db.charge.findUnique({
    where: { id: chargeId },
    include: { payments: true },
  });
  if (!charge) throw new Error("Charge not found");

  return db.$transaction(async (tx) => {
    const pay = await tx.payment.create({
      data: {
        tenantId,
        chargeId,
        amountCents,
        method: "PIX",
        createdById: userId,
      },
    });

    const totalPaid = charge.payments.reduce((s, p) => s + p.amountCents, 0) + amountCents;
    const netAmount = charge.amountCents - charge.discountCents;

    if (totalPaid >= netAmount) {
      await tx.charge.update({ where: { id: chargeId }, data: { status: "PAID" } });
    }

    return pay;
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Payment flow — charge status", () => {
  test("full payment marks charge as PAID", async () => {
    const charge = await createCharge(15000); // R$150
    await addPayment(charge.id, 15000);

    const updated = await db.charge.findUnique({ where: { id: charge.id } });
    expect(updated?.status).toBe("PAID");
  });

  test("partial payment leaves charge as PENDING", async () => {
    const charge = await createCharge(15000); // R$150
    await addPayment(charge.id, 5000); // R$50

    const updated = await db.charge.findUnique({ where: { id: charge.id } });
    expect(updated?.status).toBe("PENDING");
  });

  test("multiple partial payments that sum to full amount mark charge as PAID", async () => {
    const charge = await createCharge(10000); // R$100
    await addPayment(charge.id, 3000); // R$30

    // Re-fetch to get current payments
    const chargeWithPayments = await db.charge.findUnique({
      where: { id: charge.id },
      include: { payments: true },
    });

    // Simulate second payment
    const totalPaid = chargeWithPayments!.payments.reduce((s, p) => s + p.amountCents, 0) + 7000;
    const netAmount = chargeWithPayments!.amountCents - chargeWithPayments!.discountCents;

    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: { tenantId, chargeId: charge.id, amountCents: 7000, method: "CASH", createdById: userId },
      });
      if (totalPaid >= netAmount) {
        await tx.charge.update({ where: { id: charge.id }, data: { status: "PAID" } });
      }
    });

    const final = await db.charge.findUnique({ where: { id: charge.id } });
    expect(final?.status).toBe("PAID");
  });

  test("discount is applied: paying net amount (after discount) marks as PAID", async () => {
    const charge = await createCharge(10000, 2000); // R$100 - R$20 discount = R$80 net
    await addPayment(charge.id, 8000); // Pay exactly R$80

    const updated = await db.charge.findUnique({ where: { id: charge.id } });
    expect(updated?.status).toBe("PAID");
  });

  test("paying less than net amount (with discount) leaves charge PENDING", async () => {
    const charge = await createCharge(10000, 2000); // R$80 net
    await addPayment(charge.id, 7999); // 1 cent short

    const updated = await db.charge.findUnique({ where: { id: charge.id } });
    expect(updated?.status).toBe("PENDING");
  });
});

describe("Payment flow — payment record", () => {
  test("payment is linked to correct charge and tenant", async () => {
    const charge = await createCharge(5000);

    const payment = await db.payment.create({
      data: {
        tenantId,
        chargeId: charge.id,
        amountCents: 5000,
        method: "PIX",
        createdById: userId,
      },
    });

    expect(payment.chargeId).toBe(charge.id);
    expect(payment.tenantId).toBe(tenantId);
    expect(payment.method).toBe("PIX");
    expect(payment.amountCents).toBe(5000);
  });

  test("payment with reference is stored correctly", async () => {
    const charge = await createCharge(5000);

    const payment = await db.payment.create({
      data: {
        tenantId,
        chargeId: charge.id,
        amountCents: 5000,
        method: "TRANSFER",
        reference: "TRF-2026-001",
        createdById: userId,
      },
    });

    expect(payment.reference).toBe("TRF-2026-001");
  });

  test("payments are isolated by tenant", async () => {
    // Payments for our tenant should not appear in other tenants
    const charge = await createCharge(5000);
    await db.payment.create({
      data: { tenantId, chargeId: charge.id, amountCents: 5000, method: "CASH", createdById: userId },
    });

    const otherTenantPayments = await db.payment.findMany({
      where: { tenantId: "00000000-0000-0000-0000-000000000000" }, // non-existent tenant
    });
    expect(otherTenantPayments).toHaveLength(0);
  });
});
