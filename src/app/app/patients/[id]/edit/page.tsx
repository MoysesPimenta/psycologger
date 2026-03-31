import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { getPatientScope } from "@/lib/rbac";
import { EditPatientClient } from "@/components/patients/edit-patient-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const patient = await db.patient.findUnique({
    where: { id: params.id },
    select: { fullName: true },
  });
  return { title: patient ? `Editar — ${patient.fullName}` : "Editar Paciente" };
}

export default async function EditPatientPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) notFound();

  const scope = getPatientScope(ctx);
  const patient = await db.patient.findFirst({
    where: {
      id: params.id,
      tenantId: ctx.tenantId,
      ...(scope === "ASSIGNED" && { assignedUserId: ctx.userId }),
    },
    include: {
      assignedUser: { select: { id: true, name: true } },
      contacts: true,
    },
  });

  if (!patient) notFound();

  // Fetch appointment types for billing defaults
  const appointmentTypes = await db.appointmentType.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    select: { id: true, name: true, defaultPriceCents: true },
    orderBy: { name: "asc" },
  });

  // Fetch providers (psychologists) for the assigned provider dropdown
  const providers = await db.membership.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "ACTIVE" as never,
      role: { in: ["PSYCHOLOGIST" as never, "TENANT_ADMIN" as never] },
    },
    select: {
      user: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Editar Paciente</h1>
        <p className="text-sm text-gray-500 mt-1">{patient.fullName}</p>
      </div>
      <EditPatientClient
        patient={patient as never}
        appointmentTypes={appointmentTypes}
        providers={providers.map((m) => m.user)}
      />
    </div>
  );
}
