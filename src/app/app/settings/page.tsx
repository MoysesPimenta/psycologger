import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, Users, Calendar, Bell, Puzzle, Download, Shield } from "lucide-react";

export const metadata = { title: "Configurações" };

const settingSections = [
  { href: "/app/settings/clinic", icon: Building2, label: "Clínica", desc: "Nome, endereço e informações fiscais" },
  { href: "/app/settings/users", icon: Users, label: "Usuários & Papéis", desc: "Convide e gerencie a equipe" },
  { href: "/app/settings/appointment-types", icon: Calendar, label: "Tipos de consulta", desc: "Configure tipos, durações e preços" },
  { href: "/app/settings/reminders", icon: Bell, label: "Lembretes", desc: "Edite modelos de email de lembrete" },
  { href: "/app/settings/integrations", icon: Puzzle, label: "Integrações", desc: "Google Calendar, NFSe" },
  { href: "/app/settings/export", icon: Download, label: "Exportar dados", desc: "Baixe todos os dados da clínica" },
];

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Gerencie sua clínica e preferências</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {settingSections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow flex items-center gap-4 group"
            >
              <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{s.label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{s.desc}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
