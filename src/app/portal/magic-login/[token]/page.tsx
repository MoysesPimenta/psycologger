import { PortalMagicLoginClient } from "@/components/portal/portal-magic-login-client";

export const metadata = { title: "Entrando — Portal do Paciente" };

export default function PortalMagicLoginPage({
  params,
}: {
  params: { token: string };
}) {
  return <PortalMagicLoginClient token={params.token} />;
}
