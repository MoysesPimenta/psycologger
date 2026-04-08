/**
 * Shared layout for the /sa/* SuperAdmin console.
 *
 * Deliberately excludes /sa/login so that the login page does not show the
 * admin sidebar before authentication.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  BarChart3,
  FileText,
  Shield,
  AlertTriangle,
  Inbox,
} from "lucide-react";

// NOTE: the /sa/login page intentionally renders a `fixed inset-0` backdrop so
// it covers this sidebar — we cannot conditionally opt out of a server layout
// without a route group rewrite.
export default function SALayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="flex">
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-900 min-h-screen sticky top-0">
          <div className="p-5 border-b border-gray-800">
            <p className="text-xs uppercase tracking-wider text-brand-400 font-semibold">
              Psycologger
            </p>
            <p className="text-sm text-gray-300 mt-0.5">SuperAdmin Console</p>
          </div>
          <nav className="flex-1 p-3 space-y-1 text-sm">
            <NavItem href="/sa/dashboard" icon={LayoutDashboard} label="Dashboard" />
            <NavItem href="/sa/metrics" icon={BarChart3} label="Métricas SaaS" />
            <NavItem href="/sa/tenants" icon={Building2} label="Clínicas" />
            <NavItem href="/sa/users" icon={Users} label="Usuários" />
            <NavItem href="/sa/quota-audit" icon={AlertTriangle} label="Over-quota" />
            <NavItem href="/sa/support" icon={Inbox} label="Suporte" />
            <NavItem href="/sa/audit" icon={FileText} label="Auditoria" />
            {process.env.NODE_ENV !== "production" && (
              <NavItem href="/sa/impersonate" icon={Shield} label="Impersonar" />
            )}
          </nav>
          <div className="p-4 text-[10px] text-gray-600 border-t border-gray-800">
            <p>Toda ação é auditada.</p>
            <p className="mt-1">Respeite a privacidade dos pacientes.</p>
          </div>
        </aside>

        <main className="flex-1 p-6 md:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
    >
      <Icon className="h-4 w-4 text-brand-400" />
      {label}
    </Link>
  );
}
