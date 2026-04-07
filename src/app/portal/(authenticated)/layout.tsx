import { PortalShell } from "@/components/portal/portal-shell";
import { PortalErrorBoundary } from "@/components/portal/portal-error-boundary";
import { SwRegister } from "@/components/pwa/sw-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";

export const metadata = {
  title: "Portal do Paciente — Psycologger",
};

export default function PortalAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalErrorBoundary>
      <PortalShell>{children}</PortalShell>
      <SwRegister />
      <InstallPrompt />
    </PortalErrorBoundary>
  );
}
