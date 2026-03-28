/**
 * Unit tests — Audit log PHI redaction
 */

// We replicate the redact function here to test it independently
const PHI_KEYS = new Set([
  "noteText", "note", "notes", "content", "body",
  "fullName", "name", "email", "phone", "cpf", "dob",
  "address", "diagnosis", "medication", "prescription",
]);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PHI_KEYS.has(key)) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redact(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

describe("Audit — PHI redaction", () => {
  test("redacts name field", () => {
    const result = redact({ name: "Ana Silva", action: "PATIENT_CREATE" });
    expect(result.name).toBe("[REDACTED]");
    expect(result.action).toBe("PATIENT_CREATE");
  });

  test("redacts noteText field", () => {
    const result = redact({ noteText: "Patient reported anxiety...", sessionId: "abc" });
    expect(result.noteText).toBe("[REDACTED]");
    expect(result.sessionId).toBe("abc");
  });

  test("redacts nested PHI", () => {
    const result = redact({ patient: { name: "Ana", id: "123" } });
    expect((result.patient as Record<string, unknown>).name).toBe("[REDACTED]");
    expect((result.patient as Record<string, unknown>).id).toBe("123");
  });

  test("does not redact non-PHI fields", () => {
    const result = redact({ patientId: "abc", amountCents: 10000, status: "PAID" });
    expect(result.patientId).toBe("abc");
    expect(result.amountCents).toBe(10000);
    expect(result.status).toBe("PAID");
  });

  test("leaves arrays intact (non-PHI)", () => {
    const result = redact({ tags: ["ansiedade", "depressão"] });
    expect(result.tags).toEqual(["ansiedade", "depressão"]);
  });

  test("redacts email and phone", () => {
    const result = redact({ email: "ana@example.com", phone: "11999999999" });
    expect(result.email).toBe("[REDACTED]");
    expect(result.phone).toBe("[REDACTED]");
  });
});
