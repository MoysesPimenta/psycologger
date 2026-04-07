import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ReportsClient } from "@/components/reports/reports-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("pageTitle");
  return { title: t("reports") };
}

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const t = await getTranslations("pageTitle");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("reports")}</h1>
        <p className="text-sm text-gray-500 mt-1">Análise financeira e exportação</p>
      </div>
      <ReportsClient />
    </div>
  );
}
