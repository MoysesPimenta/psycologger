import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewPatientClient } from "@/components/patients/new-patient-client";

export const metadata = { title: "Novo Paciente" };

export default async function NewPatientPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Novo Paciente</h1>
        <p className="text-sm text-gray-500 mt-1">Preencha os dados do paciente</p>
      </div>
      <NewPatientClient />
    </div>
  );
}
