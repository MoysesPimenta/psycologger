"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Calendar,
  Users,
  DollarSign,
  BarChart3,
  Settings,
  ClipboardList,
  Clock,
  Shield,
  LogOut,
  Menu,
  X,
  Stethoscope,
  BookOpen,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn, initials } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "./locale-switcher";

const navItemsConfig = [
  { href: "/app/today", label: "nav.today", icon: Clock },
  { href: "/app/calendar", label: "nav.calendar", icon: Calendar },
  { href: "/app/patients", label: "nav.patients", icon: Users },
  { href: "/app/financial", label: "nav.financial", icon: DollarSign },
  { href: "/app/reports", label: "nav.reports", icon: BarChart3 },
  { href: "/app/journal-inbox", label: "nav.journal", icon: BookOpen },
];

const bottomNavItemsConfig = [
  { href: "/app/audit", label: "nav.audit", icon: Shield },
  { href: "/app/settings", label: "nav.settings", icon: Settings },
];

// Mobile bottom nav items (top destinations only)
const mobileNavItemsConfig = [
  { href: "/app/today", label: "nav.today", icon: Clock },
  { href: "/app/calendar", label: "nav.calendar", icon: Calendar },
  { href: "/app/patients", label: "nav.patients", icon: Users },
  { href: "/app/financial", label: "nav.financial", icon: DollarSign },
  { href: "/app/settings", label: "nav.settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslations();

  const user = session?.user;
  const userName = user?.name ?? user?.email ?? t("common.user");

  // Build nav items with translated labels
  const navItems = navItemsConfig.map((item) => ({
    ...item,
    label: t(item.label),
  }));

  const bottomNavItems = bottomNavItemsConfig.map((item) => ({
    ...item,
    label: t(item.label),
  }));

  const mobileNavItems = mobileNavItemsConfig.map((item) => ({
    ...item,
    label: item.label === "nav.settings" ? t(item.label) : t(item.label),
  }));

  return (
    <>
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-white/90 backdrop-blur border-b flex items-center gap-3 px-4 safe-pt">
        <button
          className="-ml-1 p-2 rounded-lg active:bg-gray-100 tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center">
            <Stethoscope className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-brand-900">Psycologger</span>
        </div>
      </header>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-full w-64 bg-white border-r flex flex-col transition-transform duration-200",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Stethoscope className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-lg text-brand-900">Psycologger</span>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom nav */}
        <div className="px-3 py-2 border-t space-y-1">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* User footer */}
        <div className="px-3 py-3 border-t space-y-3">
          {/* Locale Switcher */}
          <div className="px-1">
            <LocaleSwitcher />
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50">
            <div className="w-8 h-8 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initials(userName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title={t("common.logout")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom navigation bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t md:hidden safe-area-inset-bottom">
        <div className="flex justify-around">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 px-2 text-xs font-medium transition-colors flex-1 min-h-[60px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
                  isActive
                    ? "text-brand-600"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Icon className={cn("h-6 w-6", isActive && "stroke-[2]")} />
                <span className="text-[11px] leading-tight text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

    </>
  );
}
