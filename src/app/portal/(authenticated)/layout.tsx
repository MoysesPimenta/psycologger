import { PortalShell } from "@/components/portal/portal-shell";
import { PortalErrorBoundary } from "@/components/portal/portal-error-boundary";

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
    </PortalErrorBoundary>
  );
}
