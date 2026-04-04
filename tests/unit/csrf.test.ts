/**
 * Unit tests for CSRF protection — src/lib/csrf.ts
 */

import { generateCsrfToken } from "@/lib/csrf";

describe("csrf", () => {
  describe("generateCsrfToken", () => {
    it("should generate a 64-character hex string", () => {
      const token = generateCsrfToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should produce unique tokens", () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateCsrfToken()));
      expect(tokens.size).toBe(100);
    });
  });
});
