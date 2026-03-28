import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClinicSettingsClient } from "@/components/settings/clinic-settings-client";

export const metadata = { title: "Configurações da Clínica" };

export default async function ClinicSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clínica</h1>
        <p className="text-sm text-gray-500 mt-1">Nome, endereço e configurações de agenda</p>
      </div>
      <ClinicSettingsClient />
    </div>
  );
}
