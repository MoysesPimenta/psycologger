import { PortalResetPasswordClient } from "@/components/portal/portal-reset-password-client";

export const metadata = { title: "Redefinir Senha — Portal do Paciente" };

export default function PortalResetPasswordPage({
  params,
}: {
  params: { token: string };
}) {
  return <PortalResetPasswordClient token={params.token} />;
}
