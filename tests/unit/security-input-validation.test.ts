/**
 * Unit tests — Input validation security
 * Tests that Zod schemas in API routes reject malicious/invalid input
 */

// No mocks needed - this test uses pure Zod validation
import { z } from "zod";

/**
 * SQL injection payloads
 */
const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE patients; --",
  "1' OR '1'='1",
  "admin'--",
  "1' UNION SELECT * FROM users--",
  "' OR 1=1--",
];

/**
 * XSS payloads
 */
const XSS_PAYLOADS = [
  "<script>alert('xss')</script>",
  "<img src=x onerror=alert('xss')>",
  "javascript:alert('xss')",
  "<svg onload=alert('xss')>",
  "<iframe src='javascript:alert(1)'>",
];

/**
 * Test validation schemas for API routes
 */

describe("Input validation — Patients API", () => {
  const createSchema = z.object({
    fullName: z.string().min(2).max(100),
    preferredName: z.string().max(50).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().max(20).optional(),
    dob: z.string().optional(),
    notes: z.string().max(500).optional(),
    tags: z.array(z.string()).default([]),
    assignedUserId: z.string().uuid().optional(),
    defaultAppointmentTypeId: z.string().uuid().optional(),
    defaultFeeOverrideCents: z.number().int().min(0).max(100_000_000).optional(),
  });

  test("rejects missing fullName", () => {
    expect(() => createSchema.parse({ email: "test@example.com" })).toThrow();
  });

  test("rejects fullName too short", () => {
    expect(() => createSchema.parse({ fullName: "A" })).toThrow();
  });

  test("rejects fullName too long", () => {
    expect(() => createSchema.parse({ fullName: "a".repeat(101) })).toThrow();
  });

  test("rejects invalid email", () => {
    expect(() => createSchema.parse({ fullName: "Test", email: "invalid-email" })).toThrow();
  });

  test("accepts empty string as email (optional)", () => {
    const result = createSchema.parse({ fullName: "Test", email: "" });
    expect(result.email).toBe("");
  });

  test("rejects phone too long", () => {
    expect(() => createSchema.parse({ fullName: "Test", phone: "1".repeat(21) })).toThrow();
  });

  test("rejects notes too long", () => {
    expect(() => createSchema.parse({ fullName: "Test", notes: "a".repeat(501) })).toThrow();
  });

  test("rejects invalid UUID for assignedUserId", () => {
    expect(() =>
      createSchema.parse({
        fullName: "Test",
        assignedUserId: "not-a-uuid",
      })
    ).toThrow();
  });

  test("rejects invalid UUID for defaultAppointmentTypeId", () => {
    expect(() =>
      createSchema.parse({
        fullName: "Test",
        defaultAppointmentTypeId: "not-a-uuid",
      })
    ).toThrow();
  });

  test("rejects negative defaultFeeOverrideCents", () => {
    expect(() =>
      createSchema.parse({
        fullName: "Test",
        defaultFeeOverrideCents: -100,
      })
    ).toThrow();
  });

  test("rejects defaultFeeOverrideCents exceeding max", () => {
    expect(() =>
      createSchema.parse({
        fullName: "Test",
        defaultFeeOverrideCents: 100_000_001,
      })
    ).toThrow();
  });

  test("rejects non-string tags", () => {
    expect(() =>
      createSchema.parse({
        fullName: "Test",
        tags: [123, "valid"],
      })
    ).toThrow();
  });

  test("rejects defaultFeeOverrideCents as string", () => {
    expect(() =>
      createSchema.parse({
        fullName: "Test",
        defaultFeeOverrideCents: "100",
      })
    ).toThrow();
  });

  // XSS payload tests
  XSS_PAYLOADS.forEach((payload) => {
    test(`allows XSS payload in fullName (sanitization happens elsewhere): ${payload.substring(0, 20)}...`, () => {
      // Note: Zod doesn't sanitize, only validates format
      // XSS prevention should happen at rendering/output time
      const result = createSchema.parse({ fullName: payload });
      expect(result.fullName).toBe(payload);
    });
  });

  // SQL injection payloads in string fields
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    test(`allows SQL in notes (parameterized queries prevent injection): ${payload.substring(0, 20)}...`, () => {
      // Zod allows any string; SQL safety is ensured by parameterized queries
      const result = createSchema.parse({ fullName: "Test", notes: payload });
      expect(result.notes).toBe(payload);
    });
  });
});

describe("Input validation — Charges API", () => {
  const createSchema = z.object({
    patientId: z.string().uuid(),
    appointmentId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    amountCents: z.number().int().positive().max(100_000_000),
    discountCents: z.number().int().min(0).max(100_000_000).default(0),
    currency: z.string().length(3).default("BRL"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
  });

  test("rejects missing patientId", () => {
    expect(() =>
      createSchema.parse({
        amountCents: 1000,
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects invalid patientId UUID", () => {
    expect(() =>
      createSchema.parse({
        patientId: "not-uuid",
        amountCents: 1000,
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects missing amountCents", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects zero amountCents (must be positive)", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 0,
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects negative amountCents", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: -1000,
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects amountCents exceeding max", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 100_000_001,
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects amountCents as non-integer", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 1000.50,
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects negative discountCents", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 1000,
        discountCents: -100,
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects discountCents exceeding max", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 1000,
        discountCents: 100_000_001,
        dueDate: "2025-12-31",
      })
    ).toThrow();
  });

  test("rejects currency not exactly 3 chars", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 1000,
        dueDate: "2025-12-31",
        currency: "BR",
      })
    ).toThrow();
  });

  test("rejects invalid date format (not YYYY-MM-DD)", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 1000,
        dueDate: "31/12/2025",
      })
    ).toThrow();
  });

  test("accepts dueDate with invalid month (regex only validates format, not actual date validity)", () => {
    // The regex /^\d{4}-\d{2}-\d{2}$/ matches format but doesn't validate actual date values
    // "2025-13-31" has invalid month but matches the regex so it's accepted by the schema
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 1000,
        dueDate: "2025-13-31",
      })
    ).not.toThrow();
  });

  test("rejects description too long", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 1000,
        dueDate: "2025-12-31",
        description: "a".repeat(201),
      })
    ).toThrow();
  });

  test("rejects notes too long", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        amountCents: 1000,
        dueDate: "2025-12-31",
        notes: "a".repeat(501),
      })
    ).toThrow();
  });

  test("allows valid charge creation", () => {
    const result = createSchema.parse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      amountCents: 50000,
      discountCents: 5000,
      currency: "BRL",
      dueDate: "2025-12-31",
      description: "Session 2025-01-15",
      notes: "Standard rate",
    });
    expect(result.amountCents).toBe(50000);
    expect(result.currency).toBe("BRL");
  });

  test("sets default currency to BRL", () => {
    const result = createSchema.parse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      amountCents: 1000,
      dueDate: "2025-12-31",
    });
    expect(result.currency).toBe("BRL");
  });

  test("sets default discountCents to 0", () => {
    const result = createSchema.parse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      amountCents: 1000,
      dueDate: "2025-12-31",
    });
    expect(result.discountCents).toBe(0);
  });
});

describe("Input validation — Sessions API", () => {
  const createSchema = z.object({
    appointmentId: z.string().uuid().optional(),
    patientId: z.string().uuid(),
    templateKey: z.enum(["FREE", "SOAP", "BIRP"]).default("FREE"),
    noteText: z.string().min(1).max(50000),
    tags: z.array(z.string()).default([]),
    sessionDate: z.string().datetime(),
  });

  test("rejects missing patientId", () => {
    expect(() =>
      createSchema.parse({
        noteText: "Session notes",
        sessionDate: "2025-01-15T10:00:00Z",
      })
    ).toThrow();
  });

  test("rejects invalid patientId UUID", () => {
    expect(() =>
      createSchema.parse({
        patientId: "invalid",
        noteText: "Session notes",
        sessionDate: "2025-01-15T10:00:00Z",
      })
    ).toThrow();
  });

  test("rejects missing noteText", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        sessionDate: "2025-01-15T10:00:00Z",
      })
    ).toThrow();
  });

  test("rejects empty noteText", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        noteText: "",
        sessionDate: "2025-01-15T10:00:00Z",
      })
    ).toThrow();
  });

  test("rejects noteText exceeding 50000 chars", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        noteText: "a".repeat(50001),
        sessionDate: "2025-01-15T10:00:00Z",
      })
    ).toThrow();
  });

  test("rejects invalid templateKey", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        noteText: "Session notes",
        templateKey: "INVALID",
        sessionDate: "2025-01-15T10:00:00Z",
      })
    ).toThrow();
  });

  test("accepts all valid templateKey values", () => {
    const templates = ["FREE", "SOAP", "BIRP"];
    templates.forEach((template) => {
      const result = createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        noteText: "Session notes",
        templateKey: template,
        sessionDate: "2025-01-15T10:00:00Z",
      });
      expect(result.templateKey).toBe(template);
    });
  });

  test("sets default templateKey to FREE", () => {
    const result = createSchema.parse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      noteText: "Session notes",
      sessionDate: "2025-01-15T10:00:00Z",
    });
    expect(result.templateKey).toBe("FREE");
  });

  test("rejects invalid ISO datetime", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        noteText: "Session notes",
        sessionDate: "2025-01-15 10:00:00",
      })
    ).toThrow();
  });

  test("accepts ISO datetime with Z", () => {
    const result = createSchema.parse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      noteText: "Session notes",
      sessionDate: "2025-01-15T10:00:00Z",
    });
    expect(result.sessionDate).toBe("2025-01-15T10:00:00Z");
  });

  test("rejects ISO datetime with timezone offset (requires Z suffix)", () => {
    // Zod's datetime() validator requires the 'Z' suffix or proper ISO format
    // Datetime with offset like "2025-01-15T10:00:00-03:00" is rejected
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        noteText: "Session notes",
        sessionDate: "2025-01-15T10:00:00-03:00",
      })
    ).toThrow();
  });

  test("rejects non-string tags", () => {
    expect(() =>
      createSchema.parse({
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        noteText: "Session notes",
        sessionDate: "2025-01-15T10:00:00Z",
        tags: [123, "valid"],
      })
    ).toThrow();
  });

  test("allows valid session creation with all fields", () => {
    const result = createSchema.parse({
      appointmentId: "550e8400-e29b-41d4-a716-446655440001",
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      templateKey: "SOAP",
      noteText: "Patient reported improvement in symptoms...",
      tags: ["follow-up", "anxiety"],
      sessionDate: "2025-01-15T10:00:00Z",
    });
    expect(result.patientId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.templateKey).toBe("SOAP");
  });
});

describe("Input validation — general constraints", () => {
  test("UUIDs are validated strictly", () => {
    const schema = z.object({ id: z.string().uuid() });
    expect(() => schema.parse({ id: "550e8400-e29b-41d4-a716-446655440000" })).not.toThrow();
    expect(() => schema.parse({ id: "not-a-uuid" })).toThrow();
    expect(() => schema.parse({ id: "550e8400e29b41d4a716446655440000" })).toThrow();
  });

  test("date regex validates ISO date format", () => {
    const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
    expect(() => schema.parse({ date: "2025-12-31" })).not.toThrow();
    expect(() => schema.parse({ date: "2025-1-31" })).toThrow();
    expect(() => schema.parse({ date: "31/12/2025" })).toThrow();
    expect(() => schema.parse({ date: "2025-12-31 00:00:00" })).toThrow();
  });

  test("email validation rejects invalid formats", () => {
    const schema = z.object({ email: z.string().email() });
    expect(() => schema.parse({ email: "valid@example.com" })).not.toThrow();
    expect(() => schema.parse({ email: "invalid-email" })).toThrow();
    expect(() => schema.parse({ email: "@example.com" })).toThrow();
    expect(() => schema.parse({ email: "user@" })).toThrow();
  });

  test("positive number rejects zero and negatives", () => {
    const schema = z.object({ amount: z.number().positive() });
    expect(() => schema.parse({ amount: 1 })).not.toThrow();
    expect(() => schema.parse({ amount: 0 })).toThrow();
    expect(() => schema.parse({ amount: -1 })).toThrow();
  });

  test("min/max constraints are enforced", () => {
    const schema = z.object({ page: z.number().int().min(1).max(100) });
    expect(() => schema.parse({ page: 1 })).not.toThrow();
    expect(() => schema.parse({ page: 100 })).not.toThrow();
    expect(() => schema.parse({ page: 0 })).toThrow();
    expect(() => schema.parse({ page: 101 })).toThrow();
  });
});

describe("Input validation — type coercion", () => {
  test("Zod does not coerce string to number", () => {
    const schema = z.object({ amount: z.number().int() });
    expect(() => schema.parse({ amount: "1000" })).toThrow();
  });

  test("Zod does not coerce boolean from string", () => {
    const schema = z.object({ active: z.boolean() });
    expect(() => schema.parse({ active: "true" })).toThrow();
  });

  test("Zod accepts actual types only", () => {
    const schema = z.object({
      count: z.number(),
      active: z.boolean(),
      name: z.string(),
    });
    expect(() => schema.parse({
      count: 5,
      active: true,
      name: "test",
    })).not.toThrow();
  });
});
