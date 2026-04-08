import { requireSuperAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import {
  ArrowLeft, Users, Calendar, CreditCard, FileText, Clock, ShieldAlert,
} from "lucide-react";
import { TenantOpsPanel } from "@/components/sa/tenant-ops-panel";
import { getTenantQuotaUsage } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }) {
  const tenant = await db.tenant.findUnique({ where: { id: params.id }, select: { name: true } });
  return { title: tenant ? `${tenant.name} — SuperAdmin` : "Clínica" };
}

const fmt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR") : "—";

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

  const [quota, notes, activity] = await Promise.all([
    getTenantQuotaUsage(tenant.id),
    db.auditLog.findMany({
      where: { tenantId: tenant.id, action: "SA_INTERNAL_NOTE" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { email: true, name: true } } },
    }),
    db.auditLog.findMany({
      where: {
        tenantId: tenant.id,
        action: {
          in: [
            "SA_TENANT_SUSPEND",
            "SA_TENANT_REACTIVATE",
            "SA_PLAN_OVERRIDE",
            "IMPERSONATION_START",
            "IMPERSONATION_STOP",
            "BILLING_SUBSCRIPTION_CREATED",
            "BILLING_SUBSCRIPTION_CANCELED",
            "BILLING_SUBSCRIPTION_REACTIVATED",
            "BILLING_WEBHOOK_FAILED",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { email: true, name: true } } },
    }),
  ]);

  const activeMembers = tenant.memberships.filter((m) => m.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sa/tenants" className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-gray-400 text-sm">
            {tenant.slug} · Plano: <span className="text-white font-medium">{tenant.planTier}</span>{" "}
            · Status:{" "}
            <span className={tenant.subscriptionStatus === "past_due" ? "text-yellow-400" : "text-gray-300"}>
              {tenant.subscriptionStatus ?? "—"}
            </span>{" "}
            · Timezone: {tenant.timezone}
          </p>
        </div>
      </div>

      {/* Quota usage */}
      {(quota.patients.overQuota || quota.therapists.overQuota) && (
        <div className="bg-red-950/30 border border-red-900 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-400 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-red-300">Sobre o limite do plano</p>
            <p className="text-red-200/80 mt-1">
              Pacientes: {quota.patients.current}/{String(quota.patients.limit)}
              {quota.patients.overQuota ? " (excedido)" : ""} · Terapeutas: {quota.therapists.current}/
              {String(quota.therapists.limit)}
              {quota.therapists.overQuota ? " (excedido)" : ""}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Users, label: "Pacientes ativos", value: `${quota.patients.current}/${String(quota.patients.limit)}` },
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

      {/* Two-column: info + ops panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Clinic info */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
            <h2 className="font-semibold text-lg mb-3">Dados da clínica</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["CNPJ", tenant.cnpj],
                ["CPF", tenant.cpf],
                ["Telefone", tenant.phone],
                ["Website", tenant.website],
                [
                  "Endereço",
                  [tenant.addressLine, tenant.addressCity, tenant.addressState, tenant.addressZip]
                    .filter(Boolean)
                    .join(", "),
                ],
                ["Criada em", new Date(tenant.createdAt).toLocaleDateString("pt-BR")],
                ["Pacientes compartilhados", tenant.sharedPatientPool ? "Sim" : "Não"],
                ["Admin vê clínico", tenant.adminCanViewClinical ? "Sim" : "Não"],
                ["Stripe customer", tenant.stripeCustomerId ?? "—"],
                ["Stripe subscription", tenant.stripeSubscriptionId ?? "—"],
                ["Current period end", fmt(tenant.currentPeriodEnd)],
                ["Grace until", fmt(tenant.graceUntil)],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-gray-500 text-xs">{label}</p>
                  <p className="text-gray-200 break-all">{(value as string) || "—"}</p>
                </div>
              ))}
            </div>
            <div className="pt-2">
              <Link
                href={`/sa/tenants/${tenant.id}/billing`}
                className="text-xs text-brand-400 hover:text-brand-300"
              >
                Ver histórico de billing →
              </Link>
            </div>
          </div>

          {/* Members */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold">
                Membros ({tenant.memberships.length}) · {activeMembers} ativos
              </h2>
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
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        m.status === "ACTIVE"
                          ? "bg-green-900/50 text-green-400"
                          : m.status === "SUSPENDED"
                          ? "bg-red-900/50 text-red-400"
                          : "bg-yellow-900/50 text-yellow-400"
                      }`}
                    >
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

          {/* Activity timeline */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-5 border-b border-gray-800 flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-400" />
              <h2 className="font-semibold">Atividade SA / billing</h2>
            </div>
            <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
              {activity.length === 0 ? (
                <p className="p-5 text-sm text-gray-500 text-center">Sem eventos registrados.</p>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className="p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-200">{a.action}</span>
                      <span className="text-gray-500">
                        {new Date(a.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {a.user?.email && <p className="text-gray-500 mt-0.5">{a.user.email}</p>}
                    {a.summaryJson ? (
                      <pre className="mt-1 bg-gray-950 p-2 rounded overflow-auto text-[10px] text-gray-400">
                        {JSON.stringify(a.summaryJson, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <TenantOpsPanel
            tenantId={tenant.id}
            currentPlanTier={tenant.planTier}
            hasActiveMembers={activeMembers > 0}
          />

          {/* Internal notes */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="p-4 border-b border-gray-800">
              <h2 className="font-semibold text-sm">Notas internas ({notes.length})</h2>
            </div>
            <div className="divide-y divide-gray-800 max-h-[400px] overflow-y-auto">
              {notes.length === 0 ? (
                <p className="p-4 text-xs text-gray-500 text-center">Sem notas ainda.</p>
              ) : (
                notes.map((n) => {
                  const body = (n.summaryJson as { body?: string } | null)?.body ?? "";
                  return (
                    <div key={n.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-gray-500">
                        <span>{n.user?.email ?? "SA"}</span>
                        <span>{new Date(n.createdAt).toLocaleString("pt-BR")}</span>
                      </div>
                      <p className="text-gray-200 whitespace-pre-wrap">{body}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
