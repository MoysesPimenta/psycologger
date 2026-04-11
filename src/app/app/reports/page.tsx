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
  const tReports = await getTranslations("reports");

  return (
    <div className="page-section">
      <div>
        <h1 className="page-title">{t("reports")}</h1>
        <p className="page-subtitle">{tReports("headerSubtitle")}</p>
      </div>
      <ReportsClient />
    </div>
  );
}
