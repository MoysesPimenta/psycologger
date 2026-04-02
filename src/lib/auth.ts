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
      // Expose token fields to the client-side session object
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
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
      await auditLog({
        userId: user.id,
        action: "LOGIN",
        summary: { email: "[REDACTED]" },
      });
    },
    async signOut({ token }) {
      // With JWT strategy, signOut receives token (not session)
      if (token?.id) {
        await auditLog({
          userId: token.id as string,
          action: "LOGOUT",
        });
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
