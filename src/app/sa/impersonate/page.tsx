import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const metadata = { title: "Impersonar — SuperAdmin" };

export default async function SAImpersonatePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) redirect("/sa/login");

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Impersonar Usuário</h1>
            <p className="text-gray-400 text-sm">Acessar a plataforma como outro usuário</p>
          </div>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-5 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-yellow-300 font-medium">Funcionalidade em desenvolvimento</p>
            <p className="text-yellow-400/70 mt-1">
              A impersonação de usuários será implementada com log de auditoria completo.
              Todas as ações realizadas durante a impersonação serão registradas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
