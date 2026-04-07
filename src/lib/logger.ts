/**
 * Structured logger — Psycologger
 *
 * Thin wrapper around `console.*` that emits a single JSON line per log
 * record. Vercel's log drain ingests JSON natively, which makes the records
 * filterable in production.
 *
 * Usage:
 *
 *   import { logger } from "@/lib/logger";
 *   logger.info("portal-auth", "magic link sent", { tenantId, patientId });
 *   logger.warn("clinical-notes", "plaintext read in production", { sessionId });
 *   logger.error("cron/encrypt-cpfs", "backfill failed", err, { patientId });
 *
 * Guidelines:
 *   - Never log raw PHI: patient names, CPFs, note bodies, journal content,
 *     full email addresses. Log IDs and counts only.
 *   - The `scope` field is the module/route name and is searchable in Vercel.
 *   - Errors are normalized to `{ message, name, stack }` so the JSON shape
 *     stays stable for log queries.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function emit(level: LogLevel, scope: string, message: string, context?: LogContext): void {
  // Stable shape for log drains. ISO timestamps so they sort correctly.
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
  };
  if (context) {
    for (const [k, v] of Object.entries(context)) {
      record[k] = v;
    }
  }

  // Pick the right console sink so Vercel's level filtering works.
  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (level === "debug") {
    console.debug(line);
  } else {
    console.log(line);
  }
}

function normalizeError(err: unknown): LogContext {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message, errorStack: err.stack };
  }
  return { errorMessage: String(err) };
}

export const logger = {
  debug(scope: string, message: string, context?: LogContext): void {
    emit("debug", scope, message, context);
  },
  info(scope: string, message: string, context?: LogContext): void {
    emit("info", scope, message, context);
  },
  warn(scope: string, message: string, context?: LogContext): void {
    emit("warn", scope, message, context);
  },
  error(scope: string, message: string, err?: unknown, context?: LogContext): void {
    emit("error", scope, message, { ...(err !== undefined ? normalizeError(err) : {}), ...(context ?? {}) });
  },
};
