import { requireSuperAdmin } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export async function generateMetadata() {
  const t = await getTranslations("sa");
  return { title: `${t("impersonate.title")} — SuperAdmin` };
}

export default async function SAImpersonatePage() {
  await requireSuperAdmin();
  const t = await getTranslations("sa");

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{t("impersonate.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{t("impersonate.subtitle")}</p>
          </div>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-5 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-yellow-300 font-medium">{t("impersonate.underDevelopment")}</p>
            <p className="text-yellow-400/70 mt-1">{t("impersonate.explanation")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
