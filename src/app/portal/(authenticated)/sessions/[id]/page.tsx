import { PortalSessionDetailClient } from "@/components/portal/portal-session-detail-client";

export const metadata = { title: "Sessão — Portal do Paciente" };

export default function PortalSessionDetailPage({ params }: { params: { id: string } }) {
  return <PortalSessionDetailClient id={params.id} />;
}
