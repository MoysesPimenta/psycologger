import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, Users, Calendar, Bell, Puzzle, Download, UserCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("pageTitle");
  return { title: t("settings") };
}

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const t = await getTranslations("pageTitle");
  const tSettings = await getTranslations("settings");

  const settingSections = [
    { href: "/app/settings/profile", icon: UserCircle, label: tSettings("myProfile"), desc: tSettings("myProfileDesc") },
    { href: "/app/settings/clinic", icon: Building2, label: tSettings("clinic"), desc: tSettings("clinicDesc") },
    { href: "/app/settings/users", icon: Users, label: tSettings("users"), desc: tSettings("usersDesc") },
    { href: "/app/settings/appointment-types", icon: Calendar, label: tSettings("appointmentTypes"), desc: tSettings("appointmentTypesDesc") },
    { href: "/app/settings/reminders", icon: Bell, label: tSettings("reminders"), desc: tSettings("remindersDesc") },
    { href: "/app/settings/integrations", icon: Puzzle, label: tSettings("integrations"), desc: tSettings("integrationsDesc") },
    { href: "/app/settings/export", icon: Download, label: tSettings("export"), desc: tSettings("exportDesc") },
  ];

  return (
    <div className="page-section">
      <div>
        <h1 className="page-title">{t("settings")}</h1>
        <p className="page-subtitle">{tSettings("headerSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {settingSections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="bg-card rounded-xl border border-border/50 p-4 sm:p-5 hover:shadow-sm active:bg-muted/50 transition-all flex items-center gap-3 sm:gap-4 group min-h-[72px]"
            >
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{s.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{s.desc}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
