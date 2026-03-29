import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { SessionEditor } from "@/components/sessions/session-editor";

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: params.id === "new" ? "Nova Sessão" : "Editar Sessão" };
}

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { appointmentId?: string; patientId?: string };
}) {
  const ctx = await getAuthContext().catch((err) => {
    console.error("[sessions/[id]] getAuthContext failed:", err);
    return null;
  });
  if (!ctx) {
    console.error("[sessions/[id]] No auth context — redirecting to login");
    redirect("/login");
  }

  if (!can(ctx!, "sessions:view")) {
    console.error(
      `[sessions/[id]] sessions:view denied for role=${ctx!.role} ` +
        `canViewClinicalNotes=${ctx!.membership.canViewClinicalNotes} ` +
        `adminCanViewClinical=${ctx!.tenant.adminCanViewClinical}`
    );
    redirect("/app?error=no-session-access");
  }

  if (params.id === "new") {
    const patient = searchParams.patientId
      ? await db.patient.findFirst({
          where: { id: searchParams.patientId, tenantId: ctx.tenantId },
          select: { id: true, fullName: true },
        })
      : null;

    const appointment = searchParams.appointmentId
      ? await db.appointment.findFirst({
          where: { id: searchParams.appointmentId, tenantId: ctx.tenantId },
          select: { id: true, startsAt: true, appointmentType: { select: { name: true } } },
        })
      : null;

    return (
      <SessionEditor
        session={null}
        patient={patient}
        appointment={appointment as never}
        canEdit={can(ctx, "sessions:create")}
        userId={ctx.userId}
      />
    );
  }

  const session = await db.clinicalSession.findFirst({
    where: { id: params.id, tenantId: ctx.tenantId },
    include: {
      patient: { select: { id: true, fullName: true } },
      provider: { select: { id: true, name: true } },
      appointment: { select: { id: true, startsAt: true } },
      revisions: {
        orderBy: { editedAt: "desc" },
        include: { },
        take: 10,
      },
      files: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      },
    },
  });

  if (!session) notFound();

  return (
    <SessionEditor
      session={session as never}
      patient={session.patient}
      appointment={session.appointment as never}
      canEdit={can(ctx, "sessions:edit")}
      userId={ctx.userId}
    />
  );
}
