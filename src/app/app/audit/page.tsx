import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuditClient } from "@/components/audit/audit-client";

export const metadata = { title: "Auditoria" };

export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Log de Auditoria</h1>
        <p className="text-sm text-gray-500 mt-1">Registro de todas as ações no sistema</p>
      </div>
      <AuditClient />
    </div>
  );
}
