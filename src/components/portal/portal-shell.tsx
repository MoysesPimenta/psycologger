"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, PenLine, CreditCard, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { icon: Home, label: "Início", href: "/portal/dashboard" },
  { icon: Calendar, label: "Sessões", href: "/portal/sessions" },
  { icon: PenLine, label: "Diário", href: "/portal/journal" },
  { icon: CreditCard, label: "Pagamentos", href: "/portal/payments" },
  { icon: User, label: "Perfil", href: "/portal/profile" },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="fixed top-0 inset-x-0 z-40 bg-white border-b h-14 flex items-center justify-between px-4 max-w-lg mx-auto">
        <Link href="/portal/dashboard" className="text-lg font-bold text-brand-600">
          Psycologger
        </Link>
        <Link
          href="/portal/notifications"
          className={cn(
            "relative p-2 rounded-lg transition-colors",
            pathname.startsWith("/portal/notifications")
              ? "text-brand-600 bg-brand-50"
              : "text-gray-500 hover:text-gray-700",
          )}
        >
          <Bell className="h-5 w-5" />
        </Link>
      </header>

      {/* Main content */}
      <main className="pt-14 pb-20 px-4 max-w-lg mx-auto">
        <div className="py-6">{children}</div>
      </main>

      {/* Bottom navigation — mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-around max-w-lg mx-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
            const active =
              href === "/portal/dashboard"
                ? pathname === "/portal/dashboard"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center py-2 px-3 text-xs transition-colors",
                  active ? "text-brand-600" : "text-gray-400 hover:text-gray-600",
                )}
              >
                <Icon className={cn("h-5 w-5 mb-0.5", active && "stroke-[2.5]")} />
                <span className={cn("font-medium", active && "font-semibold")}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Safety disclaimer footer */}
      <div className="fixed bottom-16 inset-x-0 z-30 pointer-events-none">
        <div className="max-w-lg mx-auto px-4 pb-2">
          <p className="text-[10px] text-gray-300 text-center leading-tight">
            Este aplicativo não substitui atendimento de emergência. Em caso de crise, ligue 188
            (CVV) ou 192 (SAMU).
          </p>
        </div>
      </div>
    </div>
  );
}
