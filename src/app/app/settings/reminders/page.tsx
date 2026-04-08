import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RemindersClient } from "@/components/settings/reminders-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("remindersTitle") };
}

export default async function RemindersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const t = await getTranslations("settings");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("remindersTitle")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("remindersSubtitle")}
        </p>
      </div>
      <RemindersClient />
    </div>
  );
}
