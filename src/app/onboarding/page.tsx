/**
 * Onboarding redirect page — shown after first signup via NextAuth newUser callback.
 * If user already has a tenant membership, redirect to /app/today.
 * Otherwise show tenant creation form.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
  });

  if (membership) {
    redirect("/app/today");
  }

  // No membership — this can happen if signup was from an invite flow
  redirect("/signup");
}
