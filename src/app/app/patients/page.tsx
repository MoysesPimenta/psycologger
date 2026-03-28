import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientsClient } from "@/components/patients/patients-client";

export const metadata = { title: "Pacientes" };

export default async function PatientsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pacientes</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie seus pacientes e prontuários</p>
        </div>
        <Button asChild>
          <Link href="/app/patients/new">
            <Plus className="h-4 w-4" />
            Novo paciente
          </Link>
        </Button>
      </div>
      <PatientsClient />
    </div>
  );
}
