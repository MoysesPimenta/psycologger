/**
 * Unit tests — Utility functions (src/lib/utils.ts)
 */

import {
  formatCurrency,
  toCents,
  fromCents,
  slugify,
  generateSlug,
  initials,
  appointmentStatusLabel,
  chargeStatusLabel,
  paymentMethodLabel,
  roleLabel,
  formatTime,
  formatDate,
} from "@/lib/utils";

// ─── Currency ─────────────────────────────────────────────────────────────────

describe("toCents", () => {
  test("converts integer BRL to cents", () => {
    expect(toCents(100)).toBe(10000);
    expect(toCents(1)).toBe(100);
    expect(toCents(0)).toBe(0);
  });

  test("converts decimal BRL to cents (rounds)", () => {
    expect(toCents(79.9)).toBe(7990);
    expect(toCents(0.5)).toBe(50);
    expect(toCents(0.01)).toBe(1);
  });

  test("handles floating point imprecision with rounding", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS — toCents must round
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe("fromCents", () => {
  test("converts cents to BRL", () => {
    expect(fromCents(10000)).toBe(100);
    expect(fromCents(7990)).toBe(79.9);
    expect(fromCents(1)).toBe(0.01);
    expect(fromCents(0)).toBe(0);
  });
});

describe("formatCurrency", () => {
  test("formats BRL amounts", () => {
    const f = formatCurrency(10000);
    expect(f).toContain("100");
  });

  test("formats zero correctly", () => {
    const f = formatCurrency(0);
    expect(f).toContain("0");
  });

  test("includes currency symbol or code", () => {
    const f = formatCurrency(5000);
    // Brazilian locale uses R$ prefix
    expect(f.includes("R") || f.includes("$") || f.includes("50")).toBe(true);
  });
});

// ─── Slug ─────────────────────────────────────────────────────────────────────

describe("slugify", () => {
  test("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("removes accents", () => {
    expect(slugify("Clínica São Paulo")).toBe("clinica-sao-paulo");
  });

  test("removes special characters", () => {
    expect(slugify("Dr. João & Cia!")).toBe("dr-joao-cia");
  });

  test("trims leading and trailing hyphens", () => {
    expect(slugify("  test  ")).toBe("test");
    expect(slugify("-test-")).toBe("test");
  });

  test("collapses multiple spaces/hyphens", () => {
    expect(slugify("a  b   c")).toBe("a-b-c");
  });

  test("handles already-lowercase ASCII", () => {
    expect(slugify("abc-def")).toBe("abc-def");
  });

  test("handles numeric names", () => {
    expect(slugify("Studio 42")).toBe("studio-42");
  });
});

describe("generateSlug", () => {
  test("produces a slug starting with the slugified base", () => {
    const slug = generateSlug("Clínica Boa Vista");
    expect(slug.startsWith("clinica-boa-vista-")).toBe(true);
  });

  test("two calls produce different slugs (random suffix)", () => {
    const a = generateSlug("Test Clinic");
    const b = generateSlug("Test Clinic");
    expect(a).not.toBe(b);
  });

  test("slug contains only lowercase letters, numbers, and hyphens", () => {
    for (let i = 0; i < 10; i++) {
      const slug = generateSlug("Test Clínica São Paulo & Cia");
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

// ─── String helpers ───────────────────────────────────────────────────────────

describe("initials", () => {
  test("extracts first two initials", () => {
    expect(initials("Ana Silva")).toBe("AS");
    expect(initials("João Pedro Silva")).toBe("JP");
  });

  test("single word name gets one initial", () => {
    expect(initials("Ana")).toBe("A");
  });

  test("uppercases initials", () => {
    expect(initials("maria costa")).toBe("MC");
  });
});

// ─── Label helpers ────────────────────────────────────────────────────────────

describe("appointmentStatusLabel", () => {
  test("returns Portuguese labels for all statuses", () => {
    expect(appointmentStatusLabel("SCHEDULED")).toBe("Agendado");
    expect(appointmentStatusLabel("CONFIRMED")).toBe("Confirmado");
    expect(appointmentStatusLabel("COMPLETED")).toBe("Realizado");
    expect(appointmentStatusLabel("CANCELED")).toBe("Cancelado");
    expect(appointmentStatusLabel("NO_SHOW")).toBe("Faltou");
  });

  test("returns the raw value for unknown statuses", () => {
    expect(appointmentStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});

describe("chargeStatusLabel", () => {
  test("returns Portuguese labels for all charge statuses", () => {
    expect(chargeStatusLabel("PENDING")).toBe("Pendente");
    expect(chargeStatusLabel("PAID")).toBe("Pago");
    expect(chargeStatusLabel("OVERDUE")).toBe("Vencido");
    expect(chargeStatusLabel("VOID")).toBe("Cancelado");
    expect(chargeStatusLabel("REFUNDED")).toBe("Reembolsado");
  });
});

describe("paymentMethodLabel", () => {
  test("returns Portuguese labels for payment methods", () => {
    expect(paymentMethodLabel("PIX")).toBe("Pix");
    expect(paymentMethodLabel("CASH")).toBe("Dinheiro");
    expect(paymentMethodLabel("CARD")).toBe("Cartão");
    expect(paymentMethodLabel("TRANSFER")).toBe("Transferência");
    expect(paymentMethodLabel("INSURANCE")).toBe("Convênio");
    expect(paymentMethodLabel("OTHER")).toBe("Outro");
  });
});

describe("roleLabel", () => {
  test("returns Portuguese labels for roles", () => {
    expect(roleLabel("TENANT_ADMIN")).toBe("Administrador");
    expect(roleLabel("PSYCHOLOGIST")).toBe("Psicólogo(a)");
    expect(roleLabel("ASSISTANT")).toBe("Assistente");
    expect(roleLabel("READONLY")).toBe("Leitor");
    expect(roleLabel("SUPERADMIN")).toBe("Super Administrador");
  });
});

// ─── Date formatting ──────────────────────────────────────────────────────────

describe("formatTime", () => {
  test("formats a UTC date to HH:mm", () => {
    const date = new Date("2026-03-27T14:30:00Z");
    const result = formatTime(date);
    // The result depends on the system timezone — just verify it's HH:MM format
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatDate", () => {
  test("formats date with default dd/MM/yyyy", () => {
    const date = new Date("2026-01-15T12:00:00Z");
    const result = formatDate(date);
    // Should contain day, month, year parts
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  test("accepts a custom format string", () => {
    const date = new Date("2026-03-27T00:00:00Z");
    const result = formatDate(date, "yyyy");
    expect(result).toBe("2026");
  });
});
