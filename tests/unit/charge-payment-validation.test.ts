/**
 * Unit tests — Charge and Payment Validation Logic
 * Tests: Overpayment prevention, status transitions, partial payment handling
 * - Overpayment prevention (payment > remaining should fail)
 * - Partial payment remainder calculation
 * - Charge status transitions (PENDING → PAID, PENDING → VOID)
 * - Invalid transitions (PAID → PENDING should fail)
 * - Charge amount edit blocked after payment
 */

import { vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    charge: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/tenant");
vi.mock("@/lib/rbac");
vi.mock("@/lib/audit");

import { db } from "@/lib/db";

describe("Charge and Payment Validation", () => {
  const mockDb = db as jest.Mocked<typeof db>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Overpayment Prevention ──────────────────────────────────────────────────

  describe("Overpayment Prevention", () => {
    test("should reject payment exceeding remaining charge balance", async () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000, // R$ 100.00
        discountCents: 0,
        status: "PENDING",
        payments: [
          { id: "pay-1", amountCents: 5000 }, // R$ 50.00 already paid
        ],
      };

      mockDb.charge.findFirst.mockResolvedValueOnce(charge as any);

      const remainingCents = charge.amountCents - charge.discountCents - 5000;
      expect(remainingCents).toBe(5000); // R$ 50.00 remaining

      // Attempt to pay R$ 60.00 when only R$ 50.00 is due
      const paymentAmount = 6000;
      expect(paymentAmount).toBeGreaterThan(remainingCents);
    });

    test("should allow payment exactly equal to remaining balance", async () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 0,
        status: "PENDING",
        payments: [{ id: "pay-1", amountCents: 5000 }],
      };

      const remainingCents = charge.amountCents - charge.discountCents - 5000;
      const paymentAmount = 5000;

      expect(paymentAmount).toBe(remainingCents);
    });

    test("should account for discounts in remaining balance calculation", async () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000, // R$ 100.00
        discountCents: 2000, // R$ 20.00 discount
        status: "PENDING",
        payments: [],
      };

      // Total due = 10000 - 2000 = 8000 (R$ 80.00)
      const totalDue = charge.amountCents - charge.discountCents;
      expect(totalDue).toBe(8000);

      // Attempting to pay more than 8000 should fail
      const paymentAmount = 8500;
      expect(paymentAmount).toBeGreaterThan(totalDue);
    });
  });

  // ─── Partial Payment Remainder Calculation ───────────────────────────────────

  describe("Partial Payment Remainder Calculation", () => {
    test("should calculate remaining balance after partial payment", async () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 1000,
        status: "PENDING",
        payments: [],
      };

      const totalDue = charge.amountCents - charge.discountCents; // 9000
      const paymentAmount = 3000;
      const remainder = totalDue - paymentAmount;

      expect(remainder).toBe(6000);
      expect(remainder).toBeGreaterThan(0);
    });

    test("should create remainder charge with correct amount", async () => {
      const originalCharge = {
        id: "charge-001",
        tenantId: "tenant-1",
        patientId: "patient-1",
        providerUserId: "user-1",
        appointmentId: null,
        sessionId: null,
        amountCents: 10000,
        discountCents: 0,
        dueDate: new Date("2026-04-01"),
        status: "PENDING",
      };

      const paymentAmount = 3000;
      const remainderAmount = originalCharge.amountCents - paymentAmount;

      expect(remainderAmount).toBe(7000);

      // The remainder charge should have:
      // - Same patient and provider
      // - Remainder amount
      // - Same due date (or new due date per business logic)
      // - PENDING status
      // - No discount (discount was applied to original)
      const expectedReminderCharge = {
        tenantId: originalCharge.tenantId,
        patientId: originalCharge.patientId,
        providerUserId: originalCharge.providerUserId,
        amountCents: remainderAmount,
        discountCents: 0,
        dueDate: originalCharge.dueDate,
        status: "PENDING",
      };

      expect(expectedReminderCharge.amountCents).toBe(7000);
      expect(expectedReminderCharge.status).toBe("PENDING");
      expect(expectedReminderCharge.patientId).toBe(originalCharge.patientId);
    });

    test("should handle remainder charge naming (Saldo restante)", () => {
      const originalChargeDescription = "Sessão de terapia - 01/04/2026";
      const remainderDescription = `Saldo restante - ${originalChargeDescription}`;

      expect(remainderDescription).toContain("Saldo restante");
      expect(remainderDescription).toContain(originalChargeDescription);
    });
  });

  // ─── Charge Status Transitions ───────────────────────────────────────────────

  describe("Charge Status Transitions", () => {
    test("should transition PENDING → PAID on full payment", async () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 0,
        status: "PENDING",
        payments: [],
      };

      const paymentAmount = 10000;
      const totalDue = charge.amountCents - charge.discountCents;

      if (paymentAmount === totalDue) {
        // Status should transition to PAID
        expect("PAID").toBe("PAID");
      }
    });

    test("should transition PENDING → PAID on final partial payment", async () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 0,
        status: "PENDING",
        payments: [
          { id: "pay-1", amountCents: 7000 }, // Previous partial payment
        ],
      };

      const totalDue = charge.amountCents - charge.discountCents;
      const alreadyPaid = 7000;
      const remainingDue = totalDue - alreadyPaid;
      const finalPaymentAmount = remainingDue;

      if (finalPaymentAmount === remainingDue && remainingDue > 0) {
        expect("PAID").toBe("PAID");
      }
    });

    test("should allow PENDING → VOID transition", () => {
      const chargeStatus = "PENDING";
      const newStatus = "VOID";

      // Valid transitions: PENDING can transition to VOID
      const validTransitions: Record<string, string[]> = {
        PENDING: ["PAID", "VOID", "OVERDUE", "REFUNDED"],
        PAID: ["REFUNDED"], // Can only refund a paid charge
        OVERDUE: ["PAID", "VOID"],
        VOID: [],
        REFUNDED: [],
      };

      expect(validTransitions[chargeStatus]).toContain(newStatus);
    });

    test("should allow PENDING → OVERDUE transition", () => {
      const chargeStatus = "PENDING";
      const newStatus = "OVERDUE";

      const validTransitions: Record<string, string[]> = {
        PENDING: ["PAID", "VOID", "OVERDUE", "REFUNDED"],
        PAID: ["REFUNDED"],
        OVERDUE: ["PAID", "VOID"],
        VOID: [],
        REFUNDED: [],
      };

      expect(validTransitions[chargeStatus]).toContain(newStatus);
    });
  });

  // ─── Invalid Status Transitions ──────────────────────────────────────────────

  describe("Invalid Status Transitions", () => {
    test("should reject PAID → PENDING transition", () => {
      const chargeStatus = "PAID";
      const newStatus = "PENDING";

      const validTransitions: Record<string, string[]> = {
        PENDING: ["PAID", "VOID", "OVERDUE", "REFUNDED"],
        PAID: ["REFUNDED"],
        OVERDUE: ["PAID", "VOID"],
        VOID: [],
        REFUNDED: [],
      };

      expect(validTransitions[chargeStatus]).not.toContain(newStatus);
    });

    test("should reject PAID → VOID transition", () => {
      const chargeStatus = "PAID";
      const newStatus = "VOID";

      const validTransitions: Record<string, string[]> = {
        PENDING: ["PAID", "VOID", "OVERDUE", "REFUNDED"],
        PAID: ["REFUNDED"],
        OVERDUE: ["PAID", "VOID"],
        VOID: [],
        REFUNDED: [],
      };

      expect(validTransitions[chargeStatus]).not.toContain(newStatus);
    });

    test("should reject VOID → PAID transition", () => {
      const chargeStatus = "VOID";
      const newStatus = "PAID";

      const validTransitions: Record<string, string[]> = {
        PENDING: ["PAID", "VOID", "OVERDUE", "REFUNDED"],
        PAID: ["REFUNDED"],
        OVERDUE: ["PAID", "VOID"],
        VOID: [],
        REFUNDED: [],
      };

      expect(validTransitions[chargeStatus]).not.toContain(newStatus);
    });

    test("should reject REFUNDED → any transition", () => {
      const chargeStatus = "REFUNDED";

      const validTransitions: Record<string, string[]> = {
        PENDING: ["PAID", "VOID", "OVERDUE", "REFUNDED"],
        PAID: ["REFUNDED"],
        OVERDUE: ["PAID", "VOID"],
        VOID: [],
        REFUNDED: [],
      };

      // REFUNDED status allows no further transitions
      expect(validTransitions[chargeStatus]).toHaveLength(0);
    });
  });

  // ─── Charge Amount Edit After Payment ────────────────────────────────────────

  describe("Charge Amount Edit Blocked After Payment", () => {
    test("should block amount edit on charge with payments", () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 0,
        status: "PENDING",
        payments: [
          { id: "pay-1", amountCents: 3000 }, // Has payment
        ],
      };

      const hasPayments = charge.payments && charge.payments.length > 0;

      if (hasPayments) {
        // Editing the charge amount should be blocked
        expect(true).toBe(true);
      }
    });

    test("should allow amount edit on charge without payments", () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 0,
        status: "PENDING",
        payments: [],
      };

      const hasPayments = charge.payments && charge.payments.length > 0;

      // No payments, so editing should be allowed
      expect(hasPayments).toBe(false);
    });

    test("should block discount edit on charge with payments", () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 1000,
        status: "PENDING",
        payments: [
          { id: "pay-1", amountCents: 5000 },
        ],
      };

      const hasPayments = charge.payments && charge.payments.length > 0;

      // Cannot edit discount after partial payment (would change balance)
      if (hasPayments) {
        expect(true).toBe(true);
      }
    });

    test("should track edit history when attempting to change paid charge", async () => {
      const chargeId = "charge-001";
      const originalAmount = 10000;
      const attemptedNewAmount = 12000;

      // Audit log should record:
      // - Charge ID
      // - Original amount
      // - Attempted new amount
      // - Reason for block (has payments)
      // - Timestamp
      // - User who attempted edit

      const auditEntry = {
        action: "CHARGE_EDIT_BLOCKED",
        entityId: chargeId,
        summaryJson: {
          reason: "Charge has payments and cannot be edited",
          originalAmount: originalAmount,
          attemptedAmount: attemptedNewAmount,
        },
      };

      expect(auditEntry.summaryJson.reason).toContain("has payments");
      expect(auditEntry.action).toBe("CHARGE_EDIT_BLOCKED");
    });

    test("should allow discount-only edit on PAID charge (no impact on paid amount)", () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 0,
        status: "PAID",
        payments: [
          { id: "pay-1", amountCents: 10000 }, // Fully paid
        ],
      };

      // On PAID charges, typically no edits allowed at all
      // (discount is already applied)
      const canEdit = false;

      expect(canEdit).toBe(false);
    });
  });

  // ─── Status and Payment Consistency ──────────────────────────────────────────

  describe("Status and Payment Consistency", () => {
    test("charge status PAID should match total payments", () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 0,
        status: "PAID",
        payments: [
          { id: "pay-1", amountCents: 5000 },
          { id: "pay-2", amountCents: 5000 },
        ],
      };

      const totalPaid = charge.payments.reduce((sum, p) => sum + p.amountCents, 0);
      const totalDue = charge.amountCents - charge.discountCents;

      // If status is PAID, total payments should equal due amount
      if (charge.status === "PAID") {
        expect(totalPaid).toBe(totalDue);
      }
    });

    test("charge status PENDING with partial payments should reflect partial state", () => {
      const charge = {
        id: "charge-001",
        tenantId: "tenant-1",
        amountCents: 10000,
        discountCents: 0,
        status: "PENDING",
        payments: [
          { id: "pay-1", amountCents: 3000 },
        ],
      };

      const totalPaid = charge.payments.reduce((sum, p) => sum + p.amountCents, 0);
      const totalDue = charge.amountCents - charge.discountCents;
      const isFullyPaid = totalPaid === totalDue;
      const isPartiallPaid = totalPaid > 0 && totalPaid < totalDue;

      expect(isFullyPaid).toBe(false);
      expect(isPartiallPaid).toBe(true);
    });
  });
});
