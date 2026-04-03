import { PortalActivateClient } from "@/components/portal/portal-activate-client";

export const metadata = {
  title: "Ativar Conta — Portal do Paciente",
};

export default function PortalActivatePage({ params }: { params: { token: string } }) {
  return <PortalActivateClient token={params.token} />;
}
