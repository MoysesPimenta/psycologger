/**
 * GET /api/v1/health
 *
 * Infrastructure health check (no authentication required).
 * Checks:
 * - Database connectivity
 * - Encryption key validity
 * - Environment variable validation (required vars only)
 *
 * Returns: 200 with health status, or 503 if critical checks fail
 * Never exposes sensitive values, only names and validation status.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateAllEnvVars } from "@/lib/env-check";

interface HealthCheckEnv {
  status: "ok" | "error";
  requiredVarsSet: number;
  requiredVarsTotal: number;
  warningCount: number;
  missingVarNames: string[];
  invalidVarNames: string[];
  warningVarNames: string[];
}

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
    env: HealthCheckEnv;
  };
  version: string;
}

export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString();
  const checks: HealthCheck["checks"] = {
    database: { status: "error" },
    encryption: { status: "error" },
    env: {
      status: "error",
      requiredVarsSet: 0,
      requiredVarsTotal: 0,
      warningCount: 0,
      missingVarNames: [],
      invalidVarNames: [],
      warningVarNames: [],
    },
  };

  let overallStatus: "healthy" | "degraded" | "unhealthy" = "unhealthy";

  // Check environment variables
  try {
    const envResult = validateAllEnvVars();
    checks.env = {
      status: envResult.valid ? "ok" : "error",
      requiredVarsSet: envResult.requiredVarsSet,
      requiredVarsTotal: envResult.requiredVarsTotal,
      warningCount: envResult.warnings.length,
      missingVarNames: envResult.missingVarNames,
      invalidVarNames: envResult.invalidVarNames,
      warningVarNames: envResult.warningVarNames,
    };
  } catch (err) {
    checks.env = {
      status: "error",
      requiredVarsSet: 0,
      requiredVarsTotal: 0,
      warningCount: 0,
      missingVarNames: [],
      invalidVarNames: [],
      warningVarNames: [],
    };
  }

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
      if (key.length < 32) {
        checks.encryption = {
          status: "error",
          error: "ENCRYPTION_KEY must be at least 32 bytes (256-bit), base64-encoded",
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
  // Unhealthy if any critical check fails
  if (checks.env.status === "ok" && checks.database.status === "ok" && checks.encryption.status === "ok") {
    overallStatus = "healthy";
  } else if (
    (checks.env.status === "ok" || checks.database.status === "ok" || checks.encryption.status === "ok") &&
    (checks.env.status === "ok" && checks.database.status === "ok") // At least DB and env must be OK
  ) {
    overallStatus = "degraded";
  } else {
    overallStatus = "unhealthy";
  }

  const response: HealthCheck = {
    status: overallStatus,
    timestamp,
    checks,
    version:
      process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) ?? "unknown"
        : "development",
  };

  // Return 503 if any critical env var is missing
  const httpStatus = checks.env.status === "ok" && overallStatus !== "unhealthy" ? 200 : 503;
  return NextResponse.json(response, { status: httpStatus });
}
