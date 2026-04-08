import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewChargeClient } from "@/components/financial/new-charge-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("financial");
  return { title: t("newChargeTitle") };
}

export default async function NewChargePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const t = await getTranslations("financial");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("newChargeTitle")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("newChargeSubtitle")}</p>
      </div>
      <NewChargeClient />
    </div>
  );
}
