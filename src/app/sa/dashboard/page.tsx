import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { Building2, Users, ArrowRight } from "lucide-react";

export const metadata = { title: "SuperAdmin" };

export default async function SADashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) redirect("/sa/login");

  const [tenantCount, userCount, recentTenants] = await Promise.all([
    db.tenant.count(),
    db.user.count(),
    db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { _count: { select: { memberships: true, patients: true } } },
    }),
  ]);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold">SuperAdmin</h1>
          <p className="text-gray-400 mt-1">Psycologger Platform Console</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs">Clínicas</p>
            <p className="text-4xl font-bold mt-1">{tenantCount}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs">Usuários</p>
            <p className="text-4xl font-bold mt-1">{userCount}</p>
          </div>
        </div>

        {/* Recent tenants */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h2 className="font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand-400" />
              Clínicas recentes
            </h2>
            <Link href="/sa/tenants" className="text-sm text-brand-400 hover:text-brand-300">
              Ver todas
            </Link>
          </div>
          <div className="divide-y divide-gray-800">
            {recentTenants.map((t) => (
              <Link
                key={t.id}
                href={`/sa/tenants/${t.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors group"
              >
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t._count.memberships} membros · {t._count.patients} pacientes
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-gray-300" />
              </Link>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <Link href="/sa/tenants" className="text-sm text-brand-400 hover:underline">Gerenciar clínicas</Link>
          <Link href="/sa/users" className="text-sm text-brand-400 hover:underline">Gerenciar usuários</Link>
          <Link href="/sa/impersonate" className="text-sm text-yellow-400 hover:underline">Impersonar usuário</Link>
        </div>
      </div>
    </div>
  );
}
