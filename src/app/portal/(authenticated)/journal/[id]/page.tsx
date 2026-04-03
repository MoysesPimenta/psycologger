import { PortalJournalDetailClient } from "@/components/portal/portal-journal-detail-client";

export const metadata = { title: "Entrada — Portal do Paciente" };

export default function PortalJournalDetailPage({ params }: { params: { id: string } }) {
  return <PortalJournalDetailClient id={params.id} />;
}
