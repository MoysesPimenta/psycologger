import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppointmentTypesClient } from "@/components/settings/appointment-types-client";

export const metadata = { title: "Tipos de Consulta" };

export default async function AppointmentTypesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tipos de Consulta</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure os tipos, modalidades, durações e preços padrão
        </p>
      </div>
      <AppointmentTypesClient />
    </div>
  );
}
