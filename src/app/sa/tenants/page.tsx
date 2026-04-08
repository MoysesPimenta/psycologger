import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowRight, Building2, ArrowLeft } from "lucide-react";
import { searchTenants } from "@/lib/sa-search";

export const metadata = { title: "Clínicas — SuperAdmin" };
export const dynamic = "force-dynamic";

export default async function SATenantsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSuperAdmin();

  const page = parseInt((searchParams.page as string) || "1", 10);
  const q = (searchParams.q as string) || "";
  const planTier = (searchParams.planTier as string) || "";
  const subscriptionStatus = (searchParams.subscriptionStatus as string) || "";

  const result = await searchTenants({
    q,
    planTier: planTier || undefined,
    subscriptionStatus: subscriptionStatus || undefined,
    page,
    limit: 50,
    sortBy: "createdAt",
  });

  const { tenants, totalCount, pageCount } = result;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Clínicas</h1>
            <p className="text-gray-400 text-sm">{totalCount} registradas</p>
          </div>
        </div>

        {/* Search and filters */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <input
            type="text"
            placeholder="Buscar por nome, domínio ou ID"
            defaultValue={q}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500"
          />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <select
              defaultValue={planTier}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            >
              <option value="">Todos os planos</option>
              <option value="FREE">FREE</option>
              <option value="PRO">PRO</option>
              <option value="CLINIC">CLINIC</option>
            </select>

            <select
              defaultValue={subscriptionStatus}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            >
              <option value="">Todos os status</option>
              <option value="active">ACTIVE</option>
              <option value="past_due">PAST_DUE</option>
              <option value="canceled">CANCELED</option>
              <option value="trialing">TRIALING</option>
            </select>

            <button className="px-3 py-2 bg-brand-600 hover:bg-brand-700 rounded text-sm font-medium transition-colors">
              Filtrar
            </button>
          </div>
        </div>

        {/* Tenants grid */}
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
                    {t.slug} · Plano: {t.planTier} · Status: {t.subscriptionStatus || "—"}
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
            <p className="p-6 text-center text-gray-500">Nenhuma clínica encontrada.</p>
          )}
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              Página {page} de {pageCount}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/sa/tenants?page=${page - 1}${q ? `&q=${q}` : ""}`}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
                >
                  Anterior
                </Link>
              )}
              {page < pageCount && (
                <Link
                  href={`/sa/tenants?page=${page + 1}${q ? `&q=${q}` : ""}`}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
                >
                  Próxima
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
