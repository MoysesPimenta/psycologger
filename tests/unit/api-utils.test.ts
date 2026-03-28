/**
 * Unit tests — API utilities (src/lib/api.ts)
 * Tests: pagination helpers, error classes, rate limiting logic
 */

import { parsePagination, buildMeta, NotFoundError, ConflictError, rateLimit } from "@/lib/api";
import { ForbiddenError, UnauthorizedError } from "@/lib/rbac";

// ─── Pagination ───────────────────────────────────────────────────────────────

describe("parsePagination", () => {
  function params(obj: Record<string, string>): URLSearchParams {
    return new URLSearchParams(obj);
  }

  test("defaults to page 1, pageSize 20", () => {
    const p = parsePagination(new URLSearchParams());
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(20);
    expect(p.skip).toBe(0);
  });

  test("parses explicit page and pageSize", () => {
    const p = parsePagination(params({ page: "3", pageSize: "10" }));
    expect(p.page).toBe(3);
    expect(p.pageSize).toBe(10);
    expect(p.skip).toBe(20); // (3-1) * 10
  });

  test("skip is (page - 1) * pageSize", () => {
    const p = parsePagination(params({ page: "5", pageSize: "15" }));
    expect(p.skip).toBe(60); // (5-1) * 15
  });

  test("page cannot be less than 1", () => {
    const p = parsePagination(params({ page: "0" }));
    expect(p.page).toBe(1);
    expect(p.skip).toBe(0);
  });

  test("page cannot be negative", () => {
    const p = parsePagination(params({ page: "-5" }));
    expect(p.page).toBe(1);
  });

  test("pageSize is capped at 100", () => {
    const p = parsePagination(params({ pageSize: "200" }));
    expect(p.pageSize).toBe(100);
  });

  test("pageSize minimum is 1", () => {
    const p = parsePagination(params({ pageSize: "0" }));
    expect(p.pageSize).toBe(1);
  });

  test("invalid non-numeric values fall back to defaults (NaN-guarded)", () => {
    // parseInt("abc") = NaN — the NaN guard ensures we fall back to safe defaults
    const p = parsePagination(params({ page: "abc", pageSize: "xyz" }));
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(20);
    expect(p.skip).toBe(0);
  });
});

describe("buildMeta", () => {
  test("hasMore is true when there are more pages", () => {
    const meta = buildMeta(100, { page: 1, pageSize: 20, skip: 0 });
    expect(meta.total).toBe(100);
    expect(meta.hasMore).toBe(true);
  });

  test("hasMore is false on last page", () => {
    const meta = buildMeta(20, { page: 1, pageSize: 20, skip: 0 });
    expect(meta.hasMore).toBe(false);
  });

  test("hasMore is false when total < pageSize", () => {
    const meta = buildMeta(5, { page: 1, pageSize: 20, skip: 0 });
    expect(meta.hasMore).toBe(false);
  });

  test("hasMore is true for middle page", () => {
    const meta = buildMeta(100, { page: 2, pageSize: 20, skip: 20 });
    expect(meta.hasMore).toBe(true); // 2*20=40 < 100
  });

  test("last page exactly: 5 pages of 20, on page 5", () => {
    const meta = buildMeta(100, { page: 5, pageSize: 20, skip: 80 });
    expect(meta.hasMore).toBe(false); // 5*20=100, not < 100
  });

  test("empty result set", () => {
    const meta = buildMeta(0, { page: 1, pageSize: 20, skip: 0 });
    expect(meta.total).toBe(0);
    expect(meta.hasMore).toBe(false);
  });
});

// ─── Error classes ────────────────────────────────────────────────────────────

describe("Error classes", () => {
  test("NotFoundError has status 404", () => {
    const err = new NotFoundError("Patient");
    expect(err.status).toBe(404);
    expect(err.message).toContain("Patient");
    expect(err.name).toBe("NotFoundError");
  });

  test("NotFoundError default resource name", () => {
    const err = new NotFoundError();
    expect(err.message).toContain("Resource");
  });

  test("ConflictError has status 409", () => {
    const err = new ConflictError("Horário ocupado");
    expect(err.status).toBe(409);
    expect(err.message).toBe("Horário ocupado");
    expect(err.name).toBe("ConflictError");
  });

  test("ForbiddenError has status 403", () => {
    const err = new ForbiddenError("No permission");
    expect(err.status).toBe(403);
    expect(err.name).toBe("ForbiddenError");
  });

  test("UnauthorizedError has status 401", () => {
    const err = new UnauthorizedError();
    expect(err.status).toBe(401);
    expect(err.name).toBe("UnauthorizedError");
    expect(err.message).toBe("Authentication required");
  });

  test("all errors are instanceof Error", () => {
    expect(new NotFoundError()).toBeInstanceOf(Error);
    expect(new ConflictError("x")).toBeInstanceOf(Error);
    expect(new ForbiddenError("x")).toBeInstanceOf(Error);
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe("rateLimit (in-memory)", () => {
  // Use unique keys per test to avoid cross-test contamination
  const key = () => `test-${Math.random().toString(36).slice(2)}`;

  test("first request is allowed", () => {
    const result = rateLimit(key(), 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  test("requests within limit are all allowed", () => {
    const k = key();
    for (let i = 0; i < 5; i++) {
      const r = rateLimit(k, 5, 60_000);
      expect(r.allowed).toBe(true);
    }
  });

  test("request exceeding limit is denied", () => {
    const k = key();
    for (let i = 0; i < 5; i++) rateLimit(k, 5, 60_000);
    const r = rateLimit(k, 5, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  test("remaining decrements correctly", () => {
    const k = key();
    const r1 = rateLimit(k, 10, 60_000);
    expect(r1.remaining).toBe(9);
    const r2 = rateLimit(k, 10, 60_000);
    expect(r2.remaining).toBe(8);
  });

  test("window expiry resets the counter", () => {
    const k = key();
    // Use a very short window (already expired)
    for (let i = 0; i < 3; i++) rateLimit(k, 3, 1); // 1ms window
    // Wait for expiry
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const r = rateLimit(k, 3, 1);
        expect(r.allowed).toBe(true);
        resolve();
      }, 10);
    });
  });
});
