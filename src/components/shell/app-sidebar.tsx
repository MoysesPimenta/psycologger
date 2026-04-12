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
  CreditCard,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn, initials } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

const navItemsConfig = [
  { href: "/app/today", label: "nav.today", icon: Clock },
  { href: "/app/calendar", label: "nav.calendar", icon: Calendar },
  { href: "/app/patients", label: "nav.patients", icon: Users },
  { href: "/app/financial", label: "nav.financial", icon: DollarSign },
  { href: "/app/reports", label: "nav.reports", icon: BarChart3 },
  { href: "/app/journal-inbox", label: "nav.journal", icon: BookOpen },
];

const bottomNavItemsConfig = [
  { href: "/app/billing", label: "nav.subscription", icon: CreditCard },
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

// Roles allowed to see the audit log link
const AUDIT_ALLOWED_ROLES = new Set(["SUPERADMIN", "TENANT_ADMIN", "PSYCHOLOGIST"]);

interface AppSidebarProps {
  userRole?: string;
}

export function AppSidebar({ userRole }: AppSidebarProps) {
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

  // Filter bottom nav items based on role (audit requires SA/TA/PSY)
  const bottomNavItems = bottomNavItemsConfig
    .filter((item) => {
      if (item.href === "/app/audit" && userRole && !AUDIT_ALLOWED_ROLES.has(userRole)) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      ...item,
      label: t(item.label),
    }));

  const mobileNavItems = mobileNavItemsConfig.map((item) => ({
    ...item,
    label: item.label === "nav.settings" ? t(item.label) : t(item.label),
  }));

  return (
    <>
      {/* Mobile top bar — compact, glass-effect header */}
      <header className="md:hidden fixed top-0 inset-inline-0 z-40 h-14 bg-background/80 backdrop-blur-lg border-b border-border/50 flex items-center justify-between px-4 safe-pt">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <Stethoscope className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground tracking-tight">Psycologger</span>
        </div>
        <button
          className="p-2 rounded-lg hover:bg-muted active:bg-muted/80 tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          {mobileOpen ? <X className="h-5 w-5 text-foreground" /> : <Menu className="h-5 w-5 text-muted-foreground" />}
        </button>
      </header>

      {/* Overlay for mobile — smooth fade */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-inline-start-0 top-0 z-40 h-full w-72 bg-card border-e border-border/50 flex flex-col transition-transform duration-200 shadow-xl md:shadow-none",
          "md:w-64 md:translate-x-0 rtl:md:-translate-x-0",
          mobileOpen ? "translate-x-0 rtl:-translate-x-0" : "-translate-x-full rtl:translate-x-full md:translate-x-0 rtl:md:-translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
            <Stethoscope className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg text-foreground tracking-tight">Psycologger</span>
        </div>

        {/* Main nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
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
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "stroke-[2]")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom nav */}
        <div className="px-3 py-2 border-t border-border/50 space-y-0.5">
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
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "stroke-[2]")} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-border/50 space-y-3">
          {/* Locale + Theme */}
          <div className="flex items-center gap-2 px-1">
            <LocaleSwitcher />
            <ThemeToggle compact />
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors">
            <div className="w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
              {initials(userName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title={t("common.logout")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom navigation bar — glass effect, safe-area aware */}
      <nav className="fixed bottom-0 inset-inline-0 z-40 bg-background/80 backdrop-blur-lg border-t border-border/50 md:hidden safe-area-inset-bottom">
        <div className="flex justify-around items-end">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-1 text-xs font-medium transition-colors flex-1 min-h-[56px] tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md relative",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <span className="absolute top-0 inset-x-4 h-0.5 bg-primary rounded-full" />
                )}
                <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                <span className="text-[10px] leading-tight text-center font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

    </>
  );
}
