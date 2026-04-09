/**
 * Unit tests for environment variable validation — src/lib/env-check.ts
 */

import { randomBytes } from "crypto";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

describe("env-check", () => {
  const VALID_ENV = {
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    CRON_SECRET: "this-is-a-long-cron-secret-value",
    RESEND_API_KEY: "re_test_1234567890",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    NEXTAUTH_SECRET: "a-very-secure-secret-value-that-is-long-enough-for-32",
  };

  let validateEnv: () => void;

  beforeEach(async () => {
    // Reset module cache to re-read env
    vi.resetModules();
    // Set valid env
    for (const [k, v] of Object.entries(VALID_ENV)) {
      process.env[k] = v;
    }
    delete process.env.NEXTAUTH_URL;
    process.env.NODE_ENV = "test";
    const mod = await import("@/lib/env-check");
    validateEnv = mod.validateEnv;
  });

  afterEach(() => {
    for (const k of Object.keys(VALID_ENV)) {
      delete process.env[k];
    }
  });

  it("should pass with all valid env vars", () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it("should throw when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => validateEnv()).toThrow("ENCRYPTION_KEY");
  });

  it("should throw when ENCRYPTION_KEY is wrong length", () => {
    process.env.ENCRYPTION_KEY = randomBytes(16).toString("base64"); // 16 bytes instead of 32
    expect(() => validateEnv()).toThrow("32 bytes");
  });

  it("should throw when CRON_SECRET is too short", () => {
    process.env.CRON_SECRET = "short";
    expect(() => validateEnv()).toThrow("16 characters");
  });

  it("should throw when CRON_SECRET is empty", () => {
    delete process.env.CRON_SECRET;
    expect(() => validateEnv()).toThrow("CRON_SECRET");
  });

  it("should throw when RESEND_API_KEY has wrong prefix", () => {
    process.env.RESEND_API_KEY = "sk_test_1234567890";
    expect(() => validateEnv()).toThrow("re_");
  });

  it("should throw when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow("DATABASE_URL");
  });

  it("should throw when NEXTAUTH_SECRET is too short", () => {
    process.env.NEXTAUTH_SECRET = "short";
    expect(() => validateEnv()).toThrow("32 characters");
  });
});
