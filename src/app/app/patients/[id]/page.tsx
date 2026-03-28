import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { getPatientScope } from "@/lib/rbac";
import { PatientDetailClient } from "@/components/patients/patient-detail-client";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const patient = await db.patient.findUnique({
    where: { id: params.id },
    select: { fullName: true },
  });
  return { title: patient?.fullName ?? "Paciente" };
}

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
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
      appointments: {
        orderBy: { startsAt: "desc" },
        take: 20,
        include: {
          appointmentType: { select: { name: true, color: true } },
          provider: { select: { name: true } },
          clinicalSession: { select: { id: true } },
        },
      },
      clinicalSessions: {
        orderBy: { sessionDate: "desc" },
        take: 10,
        select: {
          id: true,
          sessionDate: true,
          templateKey: true,
          tags: true,
          provider: { select: { name: true } },
        },
      },
      charges: {
        orderBy: { dueDate: "desc" },
        take: 10,
        include: {
          payments: { select: { amountCents: true, method: true, paidAt: true } },
        },
      },
      files: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, isClinical: true },
      },
    },
  });

  if (!patient) notFound();

  const canViewClinical =
    ctx.role === "PSYCHOLOGIST" ||
    ctx.role === "SUPERADMIN" ||
    (ctx.role === "TENANT_ADMIN" && ctx.tenant.adminCanViewClinical) ||
    ctx.membership.canViewClinicalNotes === true;

  return (
    <PatientDetailClient
      patient={patient as never}
      canViewClinical={canViewClinical}
      role={ctx.role}
      userId={ctx.userId}
    />
  );
}
