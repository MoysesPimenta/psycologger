import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, LogIn } from "lucide-react";
import { searchUsers } from "@/lib/sa-search";
import { ImpersonateButton } from "@/components/sa/impersonate-button";
import { SaLiveFilters } from "@/components/sa/live-filters";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("sa");
  return { title: `${t("users.title")} — SuperAdmin` };
}
export const dynamic = "force-dynamic";

export default async function SAUsersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSuperAdmin();
  const t = await getTranslations("sa");

  const page = parseInt((searchParams.page as string) || "1", 10);
  const q = (searchParams.q as string) || "";
  const role = (searchParams.role as string) || "";
  const isSuperAdmin = (searchParams.isSuperAdmin as string) || "";
  const lastLoginRange = (searchParams.lastLoginRange as string) || "";

  const result = await searchUsers({
    q,
    role: role || undefined,
    isSuperAdmin: isSuperAdmin || undefined,
    lastLoginRange: lastLoginRange || undefined,
    page,
    limit: 50,
    sortBy: "createdAt",
  });

  const { users, totalCount, pageCount } = result;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{t("users.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{t("users.registered", { count: totalCount })}</p>
          </div>
        </div>

        {/* Search and filters — live/debounced */}
        <SaLiveFilters
          fields={[
            { name: "q", kind: "text", placeholder: t("users.searchPlaceholder") },
            {
              name: "role",
              kind: "select",
              options: [
                { value: "", label: t("users.allRoles") },
                { value: "SUPERADMIN", label: "SUPERADMIN" },
                { value: "TENANT_ADMIN", label: "TENANT_ADMIN" },
                { value: "PSYCHOLOGIST", label: "PSYCHOLOGIST" },
                { value: "ASSISTANT", label: "ASSISTANT" },
                { value: "READONLY", label: "READONLY" },
              ],
            },
            {
              name: "isSuperAdmin",
              kind: "select",
              options: [
                { value: "", label: t("users.all") },
                { value: "true", label: t("users.superAdmin") },
                { value: "false", label: t("users.notSuperAdmin") },
              ],
            },
            {
              name: "lastLoginRange",
              kind: "select",
              options: [
                { value: "", label: t("users.recentActivity") },
                { value: "7d", label: t("users.last7Days") },
                { value: "30d", label: t("users.last30Days") },
                { value: "never", label: t("users.neverLoggedIn") },
              ],
            },
          ]}
        />

        {/* Users table */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-600 dark:text-gray-400">
                <th className="p-4">{t("users.nameEmail")}</th>
                <th className="p-4">{t("users.clinics")}</th>
                <th className="p-4">{t("users.lastLogin")}</th>
                <th className="p-4">{t("users.created")}</th>
                <th className="p-4">{t("users.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-100 dark:hover:bg-gray-800/50">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{u.name ?? "—"}</p>
                      {u.isSuperAdmin && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-yellow-900/50 text-amber-700 dark:text-yellow-400 text-xs">{t("users.saBadge")}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{u.email}</p>
                  </td>
                  <td className="p-4">
                    {u.memberships.length > 0 ? (
                      <div className="space-y-1">
                        {u.memberships.map((m) => (
                          <div key={m.id} className="text-xs">
                            <span className="text-gray-900 dark:text-gray-300">{m.tenant.name}</span>
                            <span className="text-gray-600 dark:text-gray-500 ml-1">({m.role})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-600 dark:text-gray-500 text-xs">{t("users.none")}</span>
                    )}
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-400 text-xs">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("pt-BR") : t("users.never")}
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-400 text-xs">
                    {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="p-4">
                    {!u.isSuperAdmin && u.memberships.length > 0 && (
                      <ImpersonateButton userId={u.id} userName={u.name || u.email} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Página {page} de {pageCount}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/sa/users?page=${page - 1}${q ? `&q=${q}` : ""}`}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-sm"
                >
                  Anterior
                </Link>
              )}
              {page < pageCount && (
                <Link
                  href={`/sa/users?page=${page + 1}${q ? `&q=${q}` : ""}`}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-sm"
                >
                  Próxima
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
