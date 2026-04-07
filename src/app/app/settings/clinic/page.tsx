import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClinicSettingsClient } from "@/components/settings/clinic-settings-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("clinic_title") };
}

export default async function ClinicSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const t = await getTranslations("settings");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("clinic")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("clinicDesc")}</p>
      </div>
      <ClinicSettingsClient />
    </div>
  );
}
