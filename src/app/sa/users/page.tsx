import { requireSuperAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Usuários — SuperAdmin" };

export default async function SAUsersPage() {
  await requireSuperAdmin();

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      lastLoginAt: true,
      isSuperAdmin: true,
      createdAt: true,
      memberships: {
        select: {
          role: true,
          status: true,
          tenant: { select: { name: true } },
        },
      },
    },
    take: 200,
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Usuários</h1>
            <p className="text-gray-400 text-sm">{users.length} registrados</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-400">
                <th className="p-4">Nome / Email</th>
                <th className="p-4">Clínicas</th>
                <th className="p-4">Último login</th>
                <th className="p-4">Criado</th>
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
                        {u.memberships.map((m, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-gray-300">{m.tenant.name}</span>
                            <span className="text-gray-500 ml-1">({m.role})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-500 text-xs">Nenhuma</span>
                    )}
                  </td>
                  <td className="p-4 text-gray-400">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("pt-BR") : "Nunca"}
                  </td>
                  <td className="p-4 text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
