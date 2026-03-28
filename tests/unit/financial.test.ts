/**
 * Unit tests — Financial calculations
 */

import { toCents, fromCents, formatCurrency } from "@/lib/utils";

describe("Financial utilities", () => {
  test("toCents converts correctly", () => {
    expect(toCents(79.9)).toBe(7990);
    expect(toCents(100)).toBe(10000);
    expect(toCents(0.5)).toBe(50);
  });

  test("fromCents converts correctly", () => {
    expect(fromCents(7990)).toBe(79.9);
    expect(fromCents(10000)).toBe(100);
  });

  test("formatCurrency formats BRL correctly", () => {
    expect(formatCurrency(7990)).toContain("79");
    expect(formatCurrency(0)).toContain("0");
  });
});

describe("Charge status logic", () => {
  function computeChargeStatus(
    amountCents: number,
    discountCents: number,
    payments: { amountCents: number }[]
  ): "PENDING" | "PAID" | "PARTIAL" {
    const netAmount = amountCents - discountCents;
    const totalPaid = payments.reduce((s, p) => s + p.amountCents, 0);
    if (totalPaid >= netAmount) return "PAID";
    if (totalPaid > 0) return "PARTIAL";
    return "PENDING";
  }

  test("fully paid charge becomes PAID", () => {
    expect(computeChargeStatus(10000, 0, [{ amountCents: 10000 }])).toBe("PAID");
  });

  test("partial payment leaves charge PARTIAL", () => {
    expect(computeChargeStatus(10000, 0, [{ amountCents: 5000 }])).toBe("PARTIAL");
  });

  test("no payment stays PENDING", () => {
    expect(computeChargeStatus(10000, 0, [])).toBe("PENDING");
  });

  test("discount reduces net amount", () => {
    // R$100 - R$20 discount = R$80 net; R$80 paid = PAID
    expect(computeChargeStatus(10000, 2000, [{ amountCents: 8000 }])).toBe("PAID");
  });

  test("multiple partial payments", () => {
    expect(
      computeChargeStatus(10000, 0, [{ amountCents: 3000 }, { amountCents: 7000 }])
    ).toBe("PAID");
  });
});
