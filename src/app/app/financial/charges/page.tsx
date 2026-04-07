import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChargesClient } from "@/components/financial/charges-client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("charges");
  return { title: t("title") };
}

export default async function ChargesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const tCharges = await getTranslations("charges");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{tCharges("title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{tCharges("manage")}</p>
        </div>
        <Button asChild>
          <Link href="/app/financial/charges/new">
            <Plus className="h-4 w-4" /> {tCharges("new")}
          </Link>
        </Button>
      </div>
      <ChargesClient />
    </div>
  );
}
