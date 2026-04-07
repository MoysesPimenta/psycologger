/**
 * NextAuth configuration — Psycologger
 * Email magic-link (Email provider) + Prisma adapter.
 * Session strategy: JWT (required for Vercel Edge middleware compatibility —
 * Edge runtime cannot query the database, so database sessions can't be
 * verified in middleware; JWT is self-contained and works on the Edge).
 */

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { db } from "./db";
import { sendMagicLink } from "./email";
import { auditLog } from "./audit";
import { headers as nextHeaders } from "next/headers";
import { EMAIL_TOKEN_MAX_AGE_SECONDS, SESSION_MAX_AGE_SECONDS } from "./constants";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db) as NextAuthOptions["adapter"],
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM ?? "noreply@psycologger.com",
      sendVerificationRequest: async ({ identifier, url }) => {
        // Find user name if exists
        const user = await db.user.findUnique({
          where: { email: identifier },
          select: { name: true },
        });
        await sendMagicLink({
          to: identifier,
          url,
          name: user?.name ?? undefined,
        });
      },
      maxAge: EMAIL_TOKEN_MAX_AGE_SECONDS,
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
    error: "/login?error=1",
    newUser: "/onboarding",
  },
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in `user` is populated — load extra fields into JWT
      if (user) {
        token.id = user.id;
        const dbUser = await db.user.findUnique({
          where: { id: user.id as string },
          select: { isSuperAdmin: true },
        });
        token.isSuperAdmin = dbUser?.isSuperAdmin ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose only the user ID to the client-side session object.
      // isSuperAdmin is intentionally NOT exposed to the client to prevent
      // information leakage — it is only available server-side via the JWT token
      // and checked in middleware/tenant resolution.
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
    async signIn({ user }) {
      // Update last login timestamp (non-critical — errors silently ignored)
      if (user.id) {
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => {});
      }
      return true;
    },
  },
  events: {
    async signIn({ user }) {
      // Record the email domain (not the local part) so the audit trail can
      // distinguish provider/tenant signups without storing PII. Best-effort
      // capture of request meta + first tenant membership for LGPD audit trail.
      const domain = user.email?.split("@")[1] ?? "unknown";
      let ipAddress: string | undefined;
      let userAgent: string | undefined;
      try {
        const h = nextHeaders();
        ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
        userAgent = h.get("user-agent") ?? undefined;
      } catch {
        // headers() unavailable outside request scope — non-fatal
      }
      let tenantId: string | undefined;
      try {
        if (user.id) {
          const membership = await db.membership.findFirst({
            where: { userId: user.id },
            select: { tenantId: true },
            orderBy: { createdAt: "asc" },
          });
          tenantId = membership?.tenantId;
        }
      } catch {
        // best-effort only
      }
      await auditLog({
        tenantId,
        userId: user.id,
        action: "LOGIN",
        summary: { method: "magic-link", emailDomain: domain },
        ipAddress,
        userAgent,
      });
    },
    async signOut({ token }) {
      // With JWT strategy, signOut receives token (not session)
      if (!token?.id) return;
      let ipAddress: string | undefined;
      let userAgent: string | undefined;
      let tenantId: string | undefined;
      try {
        const h = nextHeaders();
        ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
        userAgent = h.get("user-agent") ?? undefined;
        tenantId = h.get("x-tenant-id") ?? undefined;
      } catch {
        // non-fatal
      }
      await auditLog({
        tenantId,
        userId: token.id as string,
        action: "LOGOUT",
        ipAddress,
        userAgent,
      });
    },
  },
  // Validation of NEXTAUTH_SECRET happens centrally in src/lib/env-check.ts
  // (called from instrumentation.ts at boot). Reading the env var here lazily
  // keeps next build / import-time tooling from crashing when the var is unset.
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
