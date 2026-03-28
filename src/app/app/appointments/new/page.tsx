import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/tenant";
import { NewAppointmentClient } from "@/components/appointments/new-appointment-client";

export const metadata = { title: "Nova Consulta" };

export default async function NewAppointmentPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nova Consulta</h1>
        <p className="text-sm text-gray-500 mt-1">Agende uma nova consulta para um paciente</p>
      </div>
      <NewAppointmentClient userId={ctx.userId} role={ctx.role} />
    </div>
  );
}
