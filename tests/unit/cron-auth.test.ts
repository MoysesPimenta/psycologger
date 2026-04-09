import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";

describe("requireCronAuth", () => {
  const originalEnv = process.env;
  const VALID_CRON_SECRET = "test-cron-secret-12345";

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = VALID_CRON_SECRET;
    process.env.NODE_ENV = "development";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("should return null on valid cron secret with bearer token", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${VALID_CRON_SECRET}`,
      },
    });

    const result = requireCronAuth(req);
    expect(result).toBeNull();
  });

  it("should return 500 when CRON_SECRET is not set", () => {
    delete process.env.CRON_SECRET;

    const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${VALID_CRON_SECRET}`,
      },
    });

    const result = requireCronAuth(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(500);
  });

  it("should return 401 when Authorization header is missing", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
      method: "GET",
    });

    const result = requireCronAuth(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("should return 401 when Bearer token is missing", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
      method: "GET",
      headers: {
        "Authorization": "Basic xyz123",
      },
    });

    const result = requireCronAuth(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("should return 401 when bearer token is incorrect", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
      method: "GET",
      headers: {
        "Authorization": "Bearer wrong-secret",
      },
    });

    const result = requireCronAuth(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  it("should accept bearer token in case-insensitive header", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
      method: "GET",
      headers: {
        "authorization": `bearer ${VALID_CRON_SECRET}`,
      },
    });

    const result = requireCronAuth(req);
    expect(result).toBeNull();
  });

  it("should return 401 when bearer token length is different", () => {
    const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
      method: "GET",
      headers: {
        "Authorization": "Bearer short",
      },
    });

    const result = requireCronAuth(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(401);
  });

  describe("production environment", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("should require x-vercel-cron header in production", () => {
      const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${VALID_CRON_SECRET}`,
        },
      });

      const result = requireCronAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    it("should allow request with x-vercel-cron header in production", () => {
      const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${VALID_CRON_SECRET}`,
          "x-vercel-cron": "1",
        },
      });

      const result = requireCronAuth(req);
      expect(result).toBeNull();
    });

    it("should reject with 401 if cron secret is wrong even with x-vercel-cron header", () => {
      const req = new NextRequest("http://localhost:3000/api/v1/cron/test", {
        method: "GET",
        headers: {
          "Authorization": "Bearer wrong-secret",
          "x-vercel-cron": "1",
        },
      });

      const result = requireCronAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });
  });
});
