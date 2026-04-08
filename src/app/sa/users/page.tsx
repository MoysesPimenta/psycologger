import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, LogIn } from "lucide-react";
import { searchUsers } from "@/lib/sa-search";
import { ImpersonateButton } from "@/components/sa/impersonate-button";

export const metadata = { title: "Usuários — SuperAdmin" };
export const dynamic = "force-dynamic";

export default async function SAUsersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSuperAdmin();

  const page = parseInt((searchParams.page as string) || "1", 10);
  const q = (searchParams.q as string) || "";
  const role = (searchParams.role as string) || "";
  const isSuperAdmin = (searchParams.isSuperAdmin as string) || "";
  const lastLoginRange = (searchParams.lastLoginRange as string) || "";

  const result = await searchUsers({
    q,
    role: role || undefined,
    isSuperAdmin: isSuperAdmin || undefined,
    lastLoginRange: lastLoginRange || undefined,
    page,
    limit: 50,
    sortBy: "createdAt",
  });

  const { users, totalCount, pageCount } = result;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Usuários</h1>
            <p className="text-gray-400 text-sm">{totalCount} registrados</p>
          </div>
        </div>

        {/* Search and filters */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <input
            type="text"
            placeholder="Buscar por email ou nome"
            defaultValue={q}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select
              defaultValue={role}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            >
              <option value="">Todos os papéis</option>
              <option value="SUPERADMIN">SUPERADMIN</option>
              <option value="TENANT_ADMIN">TENANT_ADMIN</option>
              <option value="PSYCHOLOGIST">PSYCHOLOGIST</option>
              <option value="ASSISTANT">ASSISTANT</option>
              <option value="READONLY">READONLY</option>
            </select>

            <select
              defaultValue={isSuperAdmin}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            >
              <option value="">Todos</option>
              <option value="true">SuperAdmin</option>
              <option value="false">Não SuperAdmin</option>
            </select>

            <select
              defaultValue={lastLoginRange}
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            >
              <option value="">Últimas atividades</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="never">Nunca fez login</option>
            </select>

            <button className="px-3 py-2 bg-brand-600 hover:bg-brand-700 rounded text-sm font-medium transition-colors">
              Filtrar
            </button>
          </div>
        </div>

        {/* Users table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-400">
                <th className="p-4">Nome / Email</th>
                <th className="p-4">Clínicas</th>
                <th className="p-4">Último login</th>
                <th className="p-4">Criado</th>
                <th className="p-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-800/50">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{u.name ?? "—"}</p>
                      {u.isSuperAdmin && (
                        <span className="px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 text-xs">SA</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="p-4">
                    {u.memberships.length > 0 ? (
                      <div className="space-y-1">
                        {u.memberships.map((m) => (
                          <div key={m.id} className="text-xs">
                            <span className="text-gray-300">{m.tenant.name}</span>
                            <span className="text-gray-500 ml-1">({m.role})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-500 text-xs">Nenhuma</span>
                    )}
                  </td>
                  <td className="p-4 text-gray-400 text-xs">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("pt-BR") : "Nunca"}
                  </td>
                  <td className="p-4 text-gray-400 text-xs">
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="p-4">
                    {!u.isSuperAdmin && u.memberships.length > 0 && (
                      <ImpersonateButton userId={u.id} userName={u.name || u.email} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                  href={`/sa/users?page=${page - 1}${q ? `&q=${q}` : ""}`}
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
                >
                  Anterior
                </Link>
              )}
              {page < pageCount && (
                <Link
                  href={`/sa/users?page=${page + 1}${q ? `&q=${q}` : ""}`}
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
