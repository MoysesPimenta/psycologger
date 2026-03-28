/**
 * NextAuth configuration — Psycologger
 * Email magic-link (Email provider) + Prisma adapter.
 */

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { db } from "./db";
import { sendMagicLink } from "./email";
import { auditLog } from "./audit";

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
      maxAge: 24 * 60 * 60, // 24 hours
    }),
  ],
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=1",
    error: "/login?error=1",
    newUser: "/onboarding",
  },
  callbacks: {
    async session({ session, user }) {
      // Attach user id and superadmin flag to session
      if (session.user) {
        session.user.id = user.id;
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { isSuperAdmin: true },
        });
        session.user.isSuperAdmin = dbUser?.isSuperAdmin ?? false;
      }
      return session;
    },
    async signIn({ user }) {
      // Update last login
      if (user.id) {
        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => {}); // non-critical
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
    async signOut({ session }) {
      if (session && "userId" in session) {
        await auditLog({
          userId: session.userId as string,
          action: "LOGOUT",
        });
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
