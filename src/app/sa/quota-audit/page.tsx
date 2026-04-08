import { requireSuperAdmin } from "@/lib/auth";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { listOverQuotaTenants } from "@/lib/sa-metrics";

export const metadata = { title: "Over-quota — SuperAdmin" };
export const dynamic = "force-dynamic";

export default async function SAQuotaAuditPage() {
  await requireSuperAdmin();

  const rows = await listOverQuotaTenants(500);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Clínicas sobre o limite</h1>
        <p className="text-gray-400 text-sm mt-1">
          Tenants cujo estado atual excede os limites do plano — resultado da
          enforcement que foi historicamente burlada antes do fix de abril/26.
          Use para decidir grandfathering, forçar upgrade ou suspender.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left p-3">Clínica</th>
              <th className="text-left p-3">Plano</th>
              <th className="text-left p-3">Pacientes (atual / limite)</th>
              <th className="text-left p-3">Terapeutas (atual / limite)</th>
              <th className="text-left p-3">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  Nenhuma clínica sobre o limite 🎉
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-800/40">
                  <td className="p-3">
                    <Link href={`/sa/tenants/${r.id}`} className="font-medium text-white hover:text-brand-300">
                      {r.name}
                    </Link>
                    <p className="text-xs text-gray-500">{r.slug}</p>
                  </td>
                  <td className="p-3 text-gray-300">{r.planTier}</td>
                  <td className={`p-3 ${r.overPatients ? "text-red-400 font-semibold" : "text-gray-300"}`}>
                    {r.patientsCurrent} / {String(r.patientsLimit)}
                    {r.overPatients && (
                      <AlertTriangle className="inline h-3 w-3 ml-1" aria-label="over quota" />
                    )}
                  </td>
                  <td className={`p-3 ${r.overTherapists ? "text-red-400 font-semibold" : "text-gray-300"}`}>
                    {r.therapistsCurrent} / {String(r.therapistsLimit)}
                    {r.overTherapists && (
                      <AlertTriangle className="inline h-3 w-3 ml-1" aria-label="over quota" />
                    )}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/sa/tenants/${r.id}`}
                      className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700"
                    >
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
