/**
 * GET /api/v1/health
 *
 * Infrastructure health check (no authentication required).
 * Checks:
 * - Database connectivity
 * - Encryption key validity
 * Returns: 200 with health status, or 503 if critical checks fail
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    database: {
      status: "ok" | "error";
      latencyMs?: number;
      error?: string;
    };
    encryption: {
      status: "ok" | "error";
      error?: string;
    };
  };
  version: string;
}

export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString();
  const checks: HealthCheck["checks"] = {
    database: { status: "error" },
    encryption: { status: "error" },
  };

  let overallStatus: "healthy" | "degraded" | "unhealthy" = "unhealthy";

  // Check database connectivity
  const dbStart = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = {
      status: "ok",
      latencyMs: Date.now() - dbStart,
    };
  } catch (err) {
    checks.database = {
      status: "error",
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }

  // Check encryption key validity
  try {
    const keyBase64 = process.env.ENCRYPTION_KEY;
    if (!keyBase64) {
      checks.encryption = {
        status: "error",
        error: "ENCRYPTION_KEY environment variable not set",
      };
    } else {
      const key = Buffer.from(keyBase64, "base64");
      if (key.length !== 32) {
        checks.encryption = {
          status: "error",
          error: "ENCRYPTION_KEY must be 32 bytes (256-bit), base64-encoded",
        };
      } else {
        checks.encryption = {
          status: "ok",
        };
      }
    }
  } catch (err) {
    checks.encryption = {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to validate encryption key",
    };
  }

  // Determine overall status
  if (checks.database.status === "ok" && checks.encryption.status === "ok") {
    overallStatus = "healthy";
  } else if (checks.database.status === "ok" || checks.encryption.status === "ok") {
    overallStatus = "degraded";
  }

  const response: HealthCheck = {
    status: overallStatus,
    timestamp,
    checks,
    version: process.env.VERCEL_ENV === "production"
      ? (process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) ?? "unknown")
      : "development",
  };

  const httpStatus = overallStatus === "healthy" ? 200 : 503;
  return NextResponse.json(response, { status: httpStatus });
}
