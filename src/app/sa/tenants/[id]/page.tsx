import { requireSuperAdmin } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, Users, Calendar, CreditCard, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const tenant = await db.tenant.findUnique({ where: { id: params.id }, select: { name: true } });
  return { title: tenant ? `${tenant.name} — SuperAdmin` : "Clínica" };
}

export default async function SATenantDetailPage({ params }: { params: { id: string } }) {
  await requireSuperAdmin();

  const tenant = await db.tenant.findUnique({
    where: { id: params.id },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { patients: true, appointments: true, charges: true, clinicalSessions: true } },
    },
  });

  if (!tenant) notFound();

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/tenants" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="text-gray-400 text-sm">
              {tenant.slug} · Plano: {tenant.plan} · Timezone: {tenant.timezone}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Users, label: "Pacientes", value: tenant._count.patients },
            { icon: Calendar, label: "Consultas", value: tenant._count.appointments },
            { icon: CreditCard, label: "Cobranças", value: tenant._count.charges },
            { icon: FileText, label: "Sessões clínicas", value: tenant._count.clinicalSessions },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                <Icon className="h-4 w-4" />
                {label}
              </div>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        {/* Clinic info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
          <h2 className="font-semibold text-lg mb-3">Dados da clínica</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["CNPJ", tenant.cnpj],
              ["CPF", tenant.cpf],
              ["Telefone", tenant.phone],
              ["Website", tenant.website],
              ["Endereço", [tenant.addressLine, tenant.addressCity, tenant.addressState, tenant.addressZip].filter(Boolean).join(", ")],
              ["Criada em", new Date(tenant.createdAt).toLocaleDateString("pt-BR")],
              ["Pacientes compartilhados", tenant.sharedPatientPool ? "Sim" : "Não"],
              ["Admin vê clínico", tenant.adminCanViewClinical ? "Sim" : "Não"],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-gray-500 text-xs">{label}</p>
                <p className="text-gray-200">{(value as string) || "—"}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Members */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl">
          <div className="p-5 border-b border-gray-800">
            <h2 className="font-semibold">Membros ({tenant.memberships.length})</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {tenant.memberships.map((m) => (
              <div key={m.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{m.user.name ?? m.user.email}</p>
                  <p className="text-xs text-gray-400">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 text-xs">{m.role}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${m.status === "ACTIVE" ? "bg-green-900/50 text-green-400" : "bg-yellow-900/50 text-yellow-400"}`}>
                    {m.status}
                  </span>
                  {m.user.lastLoginAt && (
                    <span className="text-xs text-gray-500">
                      Último login: {new Date(m.user.lastLoginAt).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
