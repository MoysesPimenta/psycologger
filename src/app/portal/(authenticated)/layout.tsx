import { PortalShell } from "@/components/portal/portal-shell";
import { PortalErrorBoundary } from "@/components/portal/portal-error-boundary";
import { SwRegister } from "@/components/pwa/sw-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { ThemeSync } from "@/components/theme-sync";
import { getPatientContext } from "@/lib/patient-auth";
import { db } from "@/lib/db";

export const metadata = {
  title: "Portal do Paciente — Psycologger",
};

export const dynamic = "force-dynamic";

export default async function PortalAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let serverTheme: "light" | "dark" | "system" = "system";
  try {
    const ctx = await getPatientContext();
    if (ctx?.patientId) {
      const p = await db.patient.findUnique({
        where: { id: ctx.patientId },
        select: { themePreference: true },
      });
      if (p?.themePreference === "light" || p?.themePreference === "dark") {
        serverTheme = p.themePreference;
      }
    }
  } catch {
    // unauthenticated routes inside this segment shouldn't normally hit
    // this branch, but if they do we just fall back to "system".
  }

  return (
    <PortalErrorBoundary>
      <ThemeSync serverTheme={serverTheme} />
      <PortalShell>{children}</PortalShell>
      <SwRegister />
      <InstallPrompt />
    </PortalErrorBoundary>
  );
}
