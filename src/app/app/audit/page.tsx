import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuditClient } from "@/components/audit/audit-client";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";

export async function generateMetadata() {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

/**
 * /app/audit — Audit log viewer
 *
 * Access: SUPERADMIN, TENANT_ADMIN, PSYCHOLOGIST (own actions only).
 * ASSISTANT and READONLY are denied (per permission matrix §Audit & Compliance).
 */
export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Fetch membership to verify role + tenant
  const membership = await db.membership.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
    },
    select: { role: true },
  });

  // Only SA, TA, and PSY can access audit logs
  const allowedRoles = ["SUPERADMIN", "TENANT_ADMIN", "PSYCHOLOGIST"];
  if (!membership || !allowedRoles.includes(membership.role)) {
    redirect("/app");
  }

  const t = await getTranslations("audit");

  // PSYCHOLOGIST can view audit page but cannot export and only sees own logs
  const canExport = membership.role === "SUPERADMIN" || membership.role === "TENANT_ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("logTitle")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("subtitle")}</p>
      </div>
      <AuditClient canExport={canExport} />
    </div>
  );
}
