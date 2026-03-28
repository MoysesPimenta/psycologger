import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExportClient } from "@/components/settings/export-client";

export const metadata = { title: "Exportar Dados" };

export default async function ExportPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Exportar Dados</h1>
        <p className="text-sm text-gray-500 mt-1">
          Baixe os dados da sua clínica em formato CSV
        </p>
      </div>
      <ExportClient />
    </div>
  );
}
