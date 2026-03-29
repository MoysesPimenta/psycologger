/**
 * API utilities — consistent error shapes, validation helpers, pagination.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "./rbac";

// ─── Standard API response shapes ────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function ok<T>(data: T, meta?: ApiSuccess<T>["meta"]): NextResponse {
  return NextResponse.json({ data, meta } as ApiSuccess<T>, { status: 200 });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data } as ApiSuccess<T>, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    { error: { code, message, details } } as ApiError,
    { status }
  );
}

// ─── Error handler ────────────────────────────────────────────────────────────

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return apiError("UNAUTHORIZED", err.message, 401);
  }
  if (err instanceof ForbiddenError) {
    return apiError("FORBIDDEN", err.message, 403);
  }
  if (err instanceof ZodError) {
    return apiError("VALIDATION_ERROR", "Invalid input", 400, err.flatten());
  }
  if (err instanceof NotFoundError) {
    return apiError("NOT_FOUND", err.message, 404);
  }
  if (err instanceof ConflictError) {
    return apiError("CONFLICT", err.message, 409);
  }
  if (err instanceof BadRequestError) {
    return apiError("BAD_REQUEST", err.message, 400);
  }
  console.error("[api] Unhandled error:", err);
  return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500);
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(resource = "Resource") {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  readonly status = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class BadRequestError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const rawPage = parseInt(searchParams.get("page") ?? "1");
  const rawPageSize = parseInt(searchParams.get("pageSize") ?? "20");
  const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
  const pageSize = Math.min(100, Math.max(1, isNaN(rawPageSize) ? 20 : rawPageSize));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function buildMeta(
  total: number,
  { page, pageSize }: PaginationParams
) {
  return {
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}

// ─── Rate limiting (simple in-memory for dev; use Upstash in prod) ────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: limit - entry.count };
}
