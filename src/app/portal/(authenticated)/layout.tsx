import { PortalShell } from "@/components/portal/portal-shell";

export const metadata = {
  title: "Portal do Paciente — Psycologger",
};

export default function PortalAuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalShell>{children}</PortalShell>;
}
