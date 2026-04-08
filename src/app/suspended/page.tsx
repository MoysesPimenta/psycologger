/**
 * /suspended — landing page shown to users whose clinic has been suspended.
 *
 * Intentionally lives OUTSIDE the /app/* segment so it does not re-trigger
 * getAuthContext() (which throws for users with only SUSPENDED memberships)
 * and cause a redirect loop with app/layout.tsx.
 *
 * Privacy: we do not surface the internal suspension reason here. If the user
 * needs to know why, they contact support.
 */

import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AlertTriangle, Mail } from "lucide-react";

export const metadata = { title: "Clínica suspensa — Psycologger" };
export const dynamic = "force-dynamic";

export default async function SuspendedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // If the user actually has an ACTIVE membership, send them back to the app.
  const active = await db.membership.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (active) redirect("/app/today");

  // Pull the most recent suspended membership for tenant name + last-known
  // contact email (the tenant's billing email if present).
  const suspended = await db.membership.findFirst({
    where: { userId: session.user.id, status: "SUSPENDED" },
    orderBy: { updatedAt: "desc" },
    include: {
      tenant: { select: { name: true, slug: true } },
    },
  });

  const tenantName = suspended?.tenant?.name ?? "Sua clínica";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-yellow-100 rounded-full p-2">
            <AlertTriangle className="h-6 w-6 text-yellow-700" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Acesso suspenso</h1>
        </div>

        <p className="text-gray-700 mb-4">
          O acesso de <strong>{tenantName}</strong> ao Psycologger foi temporariamente
          suspenso. Enquanto a suspensão estiver ativa, você não conseguirá entrar no
          sistema, visualizar pacientes ou agendar consultas.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900 font-medium mb-1">
            O que pode ter causado isto
          </p>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Mensalidade em atraso ou problema com o método de pagamento.</li>
            <li>Revisão de conformidade em andamento pelo nosso time de suporte.</li>
            <li>Solicitação administrativa do responsável pela clínica.</li>
          </ul>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Seus dados e os dos seus pacientes continuam preservados com segurança. Nenhum
          histórico clínico é excluído durante uma suspensão.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="mailto:support@psycologger.com?subject=Reativar%20acesso%20da%20cl%C3%ADnica"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
          >
            <Mail className="h-4 w-4" />
            Falar com o suporte
          </a>
          <Link
            href="/api/auth/signout"
            className="flex-1 flex items-center justify-center px-4 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-100 text-gray-700 font-medium text-sm"
          >
            Sair
          </Link>
        </div>
      </div>
    </div>
  );
}
