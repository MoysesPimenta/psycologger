import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/tenant";
import { db } from "@/lib/db";
import { NewPatientClient } from "@/components/patients/new-patient-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("patients");
  return { title: t("new") };
}

export default async function NewPatientPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext().catch(() => null);
  const appointmentTypes = ctx
    ? await db.appointmentType.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        select: { id: true, name: true, defaultPriceCents: true },
        orderBy: { name: "asc" },
      })
    : [];

  const t = await getTranslations("patients");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("new")}</h1>
        <p className="text-sm text-gray-500 mt-1">Preencha os dados do paciente</p>
      </div>
      <NewPatientClient appointmentTypes={appointmentTypes} />
    </div>
  );
}
