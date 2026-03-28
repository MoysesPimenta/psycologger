/**
 * Onboarding page — shown after first sign-in when the user has no clinic membership.
 *
 * This happens in two cases:
 *  1. New user clicked the login form (not signup) → NextAuth creates a bare user,
 *     `pages.newUser` redirects here, no membership exists.
 *  2. User was invited but hasn't accepted yet — they land here after verifying email.
 *
 * FIX: Never redirect to /signup (confusing). Instead, show the clinic setup form
 * inline so the user can complete their onboarding in one place.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { OnboardingClient } from "./onboarding-client";

export const metadata = { title: "Configurar sua clínica — Psycologger" };

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // If user already has an active membership, they're done — send to the app
  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
  });

  if (membership) {
    redirect("/app/today");
  }

  // No membership: render the clinic setup form.
  // Pass the user's name and email so they're prefilled.
  return (
    <OnboardingClient
      userName={session.user.name ?? ""}
      userEmail={session.user.email ?? ""}
    />
  );
}
