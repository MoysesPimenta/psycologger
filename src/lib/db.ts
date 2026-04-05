import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma connection pooling:
 * - Serverless (Vercel): Keep pool small to avoid exhausting Supabase connections
 *   across multiple concurrent function instances. Use &connection_limit=5 in DATABASE_URL.
 * - Development: Use warn-level query logging for debugging.
 *
 * Configure pool size via DATABASE_URL query params:
 *   ?connection_limit=5&pool_timeout=10
 */
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    datasourceUrl: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
