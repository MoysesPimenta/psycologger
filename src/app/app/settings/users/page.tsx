import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsersSettingsClient } from "@/components/settings/users-settings-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("users_title") };
}

export default async function UsersSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const t = await getTranslations("settings");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("users")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("usersDesc")}</p>
      </div>
      <UsersSettingsClient />
    </div>
  );
}
