import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PatientsClient } from "@/components/patients/patients-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("pageTitle");
  return { title: t("patients") };
}

export default async function PatientsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const t = await getTranslations("pageTitle");
  const tPatients = await getTranslations("patients");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("patients")}</h1>
          <p className="text-sm text-gray-500 mt-1">{tPatients("headerSubtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/app/patients/new">
            <Plus className="h-4 w-4" />
            {tPatients("newPatient")}
          </Link>
        </Button>
      </div>
      <PatientsClient />
    </div>
  );
}
