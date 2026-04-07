import { requireSuperAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowRight, Building2, ArrowLeft } from "lucide-react";

export const metadata = { title: "Clínicas — SuperAdmin" };

export default async function SATenantsPage() {
  await requireSuperAdmin();

  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { memberships: true, patients: true, appointments: true, charges: true } },
    },
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Clínicas</h1>
            <p className="text-gray-400 text-sm">{tenants.length} registradas</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
          {tenants.map((t) => (
            <Link
              key={t.id}
              href={`/sa/tenants/${t.id}`}
              className="flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-gray-800 rounded-lg p-2">
                  <Building2 className="h-5 w-5 text-brand-400" />
                </div>
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-gray-400">
                    {t.slug} · Plano: {t.plan} · Criada: {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-400">
                <span>{t._count.memberships} membros</span>
                <span>{t._count.patients} pacientes</span>
                <span>{t._count.appointments} consultas</span>
                <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-gray-300" />
              </div>
            </Link>
          ))}
          {tenants.length === 0 && (
            <p className="p-6 text-center text-gray-500">Nenhuma clínica registrada.</p>
          )}
        </div>
      </div>
    </div>
  );
}
