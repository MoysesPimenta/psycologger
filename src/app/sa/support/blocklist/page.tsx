import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { BlocklistManager } from "@/components/sa/blocklist-manager";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("sa");
  return { title: t("supportBlocklist.title") };
}

export default async function BlocklistPage() {
  await requireSuperAdmin();
  const t = await getTranslations("sa");

  const entries = await db.supportBlocklist.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      kind: true,
      pattern: true,
      reason: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sa/support" className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-brand-400" />
          <div>
            <h1 className="text-2xl font-bold">{t("supportBlocklist.heading")}</h1>
            <p className="text-gray-400 text-sm">{t("supportBlocklist.description")}</p>
          </div>
        </div>
      </div>

      <BlocklistManager
        entries={entries.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
