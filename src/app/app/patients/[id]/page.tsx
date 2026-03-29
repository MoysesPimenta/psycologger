import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { getPatientScope } from "@/lib/rbac";
import { PatientDetailClient } from "@/components/patients/patient-detail-client";

export const dynamic = "force-dynamic";

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
      // @ts-ignore — field added to schema; prisma generate pending on deploy
      defaultAppointmentType: { select: { id: true, name: true, defaultPriceCents: true } },
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
        take: 30,
        select: {
          id: true,
          sessionDate: true,
          templateKey: true,
          tags: true,
          deletedAt: true,
          provider: { select: { name: true } },
        },
      },
      charges: {
        orderBy: { dueDate: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          amountCents: true,
          discountCents: true,
          dueDate: true,
          description: true,
          providerUserId: true,
          appointmentId: true,
          payments: { select: { id: true, amountCents: true, method: true, paidAt: true } },
        },
      },
      files: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true, isClinical: true, deletedAt: true },
      },
    },
  });

  if (!patient) notFound();

  const appointmentTypes = await db.appointmentType.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    select: { id: true, name: true, defaultPriceCents: true },
    orderBy: { name: "asc" },
  });

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
      appointmentTypes={appointmentTypes}
    />
  );
}
