"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, PenLine, CreditCard, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { SessionTimeoutWarning } from "./session-timeout-warning";

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
    <div className="min-h-screen bg-gray-50">
      <SessionTimeoutWarning />

      {/* Top bar */}
      <header className="fixed top-0 inset-x-0 z-40 bg-white border-b border-gray-200/50 h-14 flex items-center justify-between px-4 max-w-lg md:max-w-2xl mx-auto pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href="/portal/dashboard" className="text-base font-bold text-gray-900 flex-shrink-0">
          Psycologger
        </Link>
        <Link
          href="/portal/notifications"
          className={cn(
            "relative p-2.5 rounded-lg transition-all active:scale-95",
            pathname.startsWith("/portal/notifications")
              ? "text-blue-600 bg-blue-50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
          )}
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
        </Link>
      </header>

      {/* Main content */}
      <main className="pt-16 pb-24 px-4 max-w-lg md:max-w-2xl mx-auto">
        <div className="py-4">{children}</div>
      </main>

      {/* Bottom navigation — mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200/50 safe-area-inset-bottom">
        <div className="flex justify-around max-w-lg md:max-w-2xl mx-auto px-1">
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
                  "flex flex-col items-center justify-center min-h-16 flex-1 text-[11px] font-medium transition-colors active:bg-gray-50",
                  active
                    ? "text-blue-600"
                    : "text-gray-500 hover:text-gray-700",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn(
                  "h-6 w-6 mb-1 transition-all",
                  active ? "text-blue-600 stroke-[2]" : "stroke-[1.5]"
                )} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Safety disclaimer footer */}
      <div className="fixed bottom-20 inset-x-0 z-30 pointer-events-none">
        <div className="max-w-lg mx-auto px-4 pb-2">
          <p className="text-[10px] text-gray-400 text-center leading-tight">
            Este aplicativo não substitui atendimento de emergência. Em caso de crise, ligue 188
            (CVV) ou 192 (SAMU).
          </p>
        </div>
      </div>
    </div>
  );
}
