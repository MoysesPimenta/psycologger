import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExportClient } from "@/components/settings/export-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("exportTitle") };
}

export default async function ExportPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const t = await getTranslations("settings");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("exportTitle")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("exportSubtitle")}
        </p>
      </div>
      <ExportClient />
    </div>
  );
}
