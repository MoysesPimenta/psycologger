import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SaLiveFilters } from "@/components/sa/live-filters";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("sa");
  return { title: `${t("audit.title")} — SuperAdmin` };
}
export const dynamic = "force-dynamic";

export default async function SAAuditPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSuperAdmin();
  const t = await getTranslations("sa");

  const page = parseInt((searchParams.page as string) || "1", 10);
  const limit = 100;
  const skip = (page - 1) * limit;

  const where: Record<string, any> = {};

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Filter by tenant — only if the value parses as a uuid (column is @db.Uuid,
  // Prisma throws PrismaClientValidationError on non-uuid input).
  if (searchParams.tenantId && UUID_RE.test(searchParams.tenantId as string)) {
    where.tenantId = searchParams.tenantId as string;
  }

  // Filter by user. Accepts either a uuid (exact match) or a free-text
  // email/name fragment which we resolve to a set of user ids.
  const userQ = (searchParams.userQ as string) || "";
  let userQWarning: string | null = null;
  // Reject characters that break Postgres LIKE/regex or Prisma validation when
  // passed through `contains`. Keep accents/letters/digits/spaces/._-+@.
  // ASCII + common Latin accents, digits, spaces, and a few safe punctuation.
  const SAFE_TEXT_RE = /^[a-zA-Z0-9\u00C0-\u024F\s._\-+@]+$/;
  if (userQ) {
    if (UUID_RE.test(userQ)) {
      where.userId = userQ;
    } else if (!SAFE_TEXT_RE.test(userQ)) {
      userQWarning = t("audit.invalidUserQuery");
    } else {
      try {
        const matches = await db.user.findMany({
          where: {
            OR: [
              { email: { contains: userQ, mode: "insensitive" } },
              { name: { contains: userQ, mode: "insensitive" } },
            ],
          },
          select: { id: true },
          take: 50,
        });
        where.userId = { in: matches.length > 0 ? matches.map((u) => u.id) : ["00000000-0000-0000-0000-000000000000"] };
      } catch {
        userQWarning = t("audit.invalidUserQuery");
      }
    }
  }

  // Filter by clinic (tenant) name — contains-insensitive on Tenant.name/slug,
  // resolved to a tenant id list. Complements the UUID-based tenantId filter.
  const clinicQ = (searchParams.clinicQ as string) || "";
  let clinicQWarning: string | null = null;
  if (clinicQ) {
    if (!SAFE_TEXT_RE.test(clinicQ)) {
      clinicQWarning = t("audit.invalidClinicQuery");
    } else {
      try {
        const tenants = await db.tenant.findMany({
          where: {
            OR: [
              { name: { contains: clinicQ, mode: "insensitive" } },
              { slug: { contains: clinicQ, mode: "insensitive" } },
            ],
          },
          select: { id: true },
          take: 50,
        });
        const ids = tenants.map((t) => t.id);
        // Combine with existing tenantId filter if present (intersection).
        const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
        if (where.tenantId && typeof where.tenantId === "string") {
          where.tenantId = ids.includes(where.tenantId) ? where.tenantId : ZERO_UUID;
        } else {
          where.tenantId = { in: ids.length > 0 ? ids : [ZERO_UUID] };
        }
      } catch {
        clinicQWarning = t("audit.invalidClinicQuery");
      }
    }
  }

  // Filter by action — contains, case-insensitive. "sa" matches SA_PLAN_OVERRIDE,
  // "billing" matches BILLING_*, etc.
  const actionQ = (searchParams.action as string) || (searchParams.actionPrefix as string) || "";
  if (actionQ) {
    where.action = { contains: actionQ, mode: "insensitive" };
  }

  // Date range filter. Date inputs produce "YYYY-MM-DD"; treat `since` as the
  // start of that day and `until` as the end (so "until=2026-04-08" includes
  // events that happened during 2026-04-08).
  const since = (searchParams.since as string) || "";
  const until = (searchParams.until as string) || "";
  if (since || until) {
    where.createdAt = {};
    if (since) {
      const d = new Date(`${since}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
    }
    if (until) {
      const d = new Date(`${until}T23:59:59.999Z`);
      if (!Number.isNaN(d.getTime())) where.createdAt.lte = d;
    }
    if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
  }

  const [logs, totalCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
      include: {
        user: { select: { email: true, name: true } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);

  const pageCount = Math.ceil(totalCount / limit);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-white p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{t("audit.title")}</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{t("audit.records", { count: totalCount })}</p>
          </div>
        </div>

        {/* Filters — live/debounced */}
        <SaLiveFilters
          fields={[
            { name: "tenantId", kind: "text", placeholder: t("audit.tenantIdPlaceholder") },
            { name: "clinicQ", kind: "text", placeholder: t("audit.clinicPlaceholder") },
            { name: "userQ", kind: "text", placeholder: t("audit.userPlaceholder") },
            { name: "action", kind: "text", placeholder: t("audit.actionPlaceholder") },
            { name: "since", kind: "date" },
            { name: "until", kind: "date" },
          ]}
        />

        {(userQWarning || clinicQWarning) && (
          <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-200 text-sm rounded-lg px-4 py-2">
            {userQWarning} {clinicQWarning}
          </div>
        )}

        {/* Logs table */}
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-600 dark:text-gray-400">
                <th className="p-4">Timestamp</th>
                <th className="p-4">{t("audit.action")}</th>
                <th className="p-4">{t("audit.clinic")}</th>
                <th className="p-4">{t("audit.user")}</th>
                <th className="p-4">Tenant ID</th>
                <th className="p-4">{t("audit.summary")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-100 dark:hover:bg-gray-800/50">
                  <td className="p-4 text-xs text-gray-600 dark:text-gray-400">
                    {new Date(log.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-300 text-xs">{log.action}</span>
                  </td>
                  <td className="p-4 text-xs">
                    {log.tenant ? (
                      <Link
                        href={`/sa/tenants/${log.tenant.id}`}
                        className="text-brand-400 hover:underline"
                      >
                        {log.tenant.name}
                      </Link>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-4 text-sm">
                    {log.user ? (
                      <div>
                        <p>{log.user.name || log.user.email}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-500">{log.user.email}</p>
                      </div>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-4 text-xs text-gray-600 dark:text-gray-400">{log.tenantId || "—"}</td>
                  <td className="p-4 text-xs text-gray-600 dark:text-gray-400">
                    {log.summaryJson ? (
                      <details className="cursor-pointer">
                        <summary>{t("audit.viewDetails")}</summary>
                        <pre className="text-xs bg-gray-100 dark:bg-gray-950 p-2 rounded mt-1 overflow-auto max-w-sm">
                          {JSON.stringify(log.summaryJson, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      "—"
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
                  href={`/sa/audit?page=${page - 1}`}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-sm"
                >
                  Anterior
                </Link>
              )}
              {page < pageCount && (
                <Link
                  href={`/sa/audit?page=${page + 1}`}
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
