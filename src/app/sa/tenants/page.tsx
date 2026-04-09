import { requireSuperAdmin } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowRight, Building2, ArrowLeft } from "lucide-react";
import { searchTenants } from "@/lib/sa-search";
import { SaLiveFilters } from "@/components/sa/live-filters";

export const metadata = { title: "Clínicas — SuperAdmin" };
export const dynamic = "force-dynamic";

export default async function SATenantsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSuperAdmin();
  const t = await getTranslations("sa");

  const page = parseInt((searchParams.page as string) || "1", 10);
  const q = (searchParams.q as string) || "";
  const planTier = (searchParams.planTier as string) || "";
  const subscriptionStatus = (searchParams.subscriptionStatus as string) || "";

  const result = await searchTenants({
    q,
    planTier: planTier || undefined,
    subscriptionStatus: subscriptionStatus || undefined,
    page,
    limit: 50,
    sortBy: "createdAt",
  });

  const { tenants, totalCount, pageCount } = result;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-600 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{t("tenants.title")}</h1>
            <p className="text-gray-600 dark:text-gray-500 text-sm">{t("tenants.registered", { count: totalCount })}</p>
          </div>
        </div>

        {/* Search and filters — live/debounced */}
        <SaLiveFilters
          fields={[
            { name: "q", kind: "text", placeholder: t("tenants.searchPlaceholder") },
            {
              name: "planTier",
              kind: "select",
              options: [
                { value: "", label: t("tenants.allPlans") },
                { value: "FREE", label: "FREE" },
                { value: "PRO", label: "PRO" },
                { value: "CLINIC", label: "CLINIC" },
              ],
            },
            {
              name: "subscriptionStatus",
              kind: "select",
              options: [
                { value: "", label: t("tenants.allStatuses") },
                { value: "active", label: t("tenants.active") },
                { value: "past_due", label: t("tenants.pastDue") },
                { value: "canceled", label: t("tenants.canceled") },
                { value: "trialing", label: t("tenants.trialing") },
              ],
            },
          ]}
        />

        {/* Tenants grid */}
        <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-200 dark:divide-gray-700">
          {tenants.map((tenant) => (
            <Link
              key={tenant.id}
              href={`/sa/tenants/${tenant.id}`}
              className="flex items-center justify-between p-4 hover:bg-gray-100 dark:hover:bg-gray-800/30 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-gray-200 dark:bg-gray-800 rounded-lg p-2">
                  <Building2 className="h-5 w-5 text-brand-400" />
                </div>
                <div>
                  <p className="font-medium">{tenant.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-500">
                    {tenant.slug} · {t("tenants.plan")} {tenant.planTier} · {t("tenants.status")} {tenant.subscriptionStatus || "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-500">
                <span>{tenant._count.memberships} {t("tenants.members")}</span>
                <span>{tenant._count.patients} {t("tenants.patients")}</span>
                <span>{tenant._count.appointments} {t("tenants.appointments")}</span>
                <ArrowRight className="h-4 w-4 text-gray-500 dark:text-gray-500 group-hover:text-gray-400 dark:group-hover:text-gray-400" />
              </div>
            </Link>
          ))}
          {tenants.length === 0 && (
            <p className="p-6 text-center text-gray-500 dark:text-gray-400">{t("tenants.notFound")}</p>
          )}
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {t("tenants.pagination", { page, total: pageCount })}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/sa/tenants?page=${page - 1}${q ? `&q=${q}` : ""}`}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-sm"
                >
                  {t("tenants.previous")}
                </Link>
              )}
              {page < pageCount && (
                <Link
                  href={`/sa/tenants?page=${page + 1}${q ? `&q=${q}` : ""}`}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-sm"
                >
                  {t("tenants.next")}
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
