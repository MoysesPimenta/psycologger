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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("settings")}</h1>
        <p className="text-sm text-gray-500 mt-1">{tSettings("headerSubtitle")}</p>
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
