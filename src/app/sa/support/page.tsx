import { requireSuperAdmin } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { SaLiveFilters } from "@/components/sa/live-filters";
import {
  SupportBulkActions,
  SupportMasterCheckbox,
} from "@/components/sa/support-bulk-actions";
import { SupportActiveChips } from "@/components/sa/support-active-chips";
import { SupportAutoRefresh } from "@/components/sa/support-auto-refresh";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_TEXT_RE = /^[a-zA-Z0-9\u00C0-\u024F\s._\-+@]+$/;

export async function generateMetadata() {
  const t = await getTranslations("sa");
  return { title: `${t("nav.support")} — SuperAdmin` };
}

export default async function SASupportPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSuperAdmin();
  const t = await getTranslations("sa");

  const page = parseInt((searchParams.page as string) || "1", 10);
  const limit = 50;
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  // Default view = open inbox (OPEN + PENDING). Explicit "ALL" shows every status.
  const status = searchParams.status as string | undefined;
  if (status === "ALL") {
    // no status filter
  } else if (status && ["OPEN", "PENDING", "CLOSED"].includes(status)) {
    where.status = status;
  } else {
    where.status = { in: ["OPEN", "PENDING"] };
  }

  if (searchParams.tenantId && UUID_RE.test(searchParams.tenantId as string)) {
    where.tenantId = searchParams.tenantId as string;
  }

  const fromEmail = ((searchParams.fromEmail as string) || "").trim().toLowerCase();
  let warning: string | null = null;
  if (fromEmail) {
    if (!SAFE_TEXT_RE.test(fromEmail)) {
      warning = t("support.invalidEmail");
    } else {
      where.fromEmail = { contains: fromEmail, mode: "insensitive" };
    }
  }

  const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

  // Clinic filter — resolve Tenant.name/slug contains → tenantId list
  const clinicQ = ((searchParams.clinicQ as string) || "").trim();
  if (clinicQ) {
    if (!SAFE_TEXT_RE.test(clinicQ)) {
      warning = (warning ? warning + " " : "") + t("support.invalidClinic");
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
        if (where.tenantId && typeof where.tenantId === "string") {
          where.tenantId = ids.includes(where.tenantId) ? where.tenantId : ZERO_UUID;
        } else {
          where.tenantId = { in: ids.length > 0 ? ids : [ZERO_UUID] };
        }
      } catch {
        warning = (warning ? warning + " " : "") + t("support.invalidClinic");
      }
    }
  }

  // User filter — match against the ticket itself (fromEmail / fromName) since
  // many senders don't have a linked User row. "moyses" should hit every ticket
  // whose fromEmail or fromName contains that substring.
  const userQ = ((searchParams.userQ as string) || "").trim();
  if (userQ) {
    if (!SAFE_TEXT_RE.test(userQ)) {
      warning = (warning ? warning + " " : "") + t("support.invalidUser");
    } else {
      where.OR = [
        { fromEmail: { contains: userQ, mode: "insensitive" } },
        { fromName: { contains: userQ, mode: "insensitive" } },
      ];
    }
  }

  const since = (searchParams.since as string) || "";
  const until = (searchParams.until as string) || "";
  if (since || until) {
    where.lastMessageAt = {};
    if (since) {
      const d = new Date(`${since}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) where.lastMessageAt.gte = d;
    }
    if (until) {
      const d = new Date(`${until}T23:59:59.999Z`);
      if (!Number.isNaN(d.getTime())) where.lastMessageAt.lte = d;
    }
    if (Object.keys(where.lastMessageAt).length === 0) delete where.lastMessageAt;
  }

  const [tickets, totalCount, openCount, pendingCount] = await Promise.all([
    db.supportTicket.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: limit,
      skip,
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        subject: true,
        status: true,
        lastMessageAt: true,
        tenantId: true,
      },
    }),
    db.supportTicket.count({ where }),
    db.supportTicket.count({ where: { status: "OPEN" } }),
    db.supportTicket.count({ where: { status: "PENDING" } }),
  ]);

  const pageCount = Math.ceil(totalCount / limit);

  // Resolve tenant names in a second query — SupportTicket.tenantId is a
  // scalar FK without a Prisma relation on the model.
  const tenantIds = Array.from(
    new Set(tickets.map((t) => t.tenantId).filter((v): v is string => !!v))
  );
  const tenantRows = tenantIds.length
    ? await db.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      })
    : [];
  const tenantMap = new Map(tenantRows.map((t) => [t.id, t.name]));

  // Aggregate per-ticket message stats for badges (counts + first/last
  // timestamps + first SA reply for the One Stop Shop calculation). One
  // bulk query per metric, all scoped to the visible page only.
  const ticketIds = tickets.map((t) => t.id);
  type Stats = {
    inbound: number;
    outbound: number;
    notes: number;
    firstAt: Date | null;
    lastInboundAt: Date | null;
    /** True iff the customer replied within 3 days of any SA outbound. */
    customerRepliedFast: boolean;
  };
  const stats = new Map<string, Stats>(
    ticketIds.map((id) => [
      id,
      {
        inbound: 0,
        outbound: 0,
        notes: 0,
        firstAt: null,
        lastInboundAt: null,
        customerRepliedFast: false,
      },
    ])
  );
  if (ticketIds.length > 0) {
    const msgs = await db.supportMessage.findMany({
      where: { ticketId: { in: ticketIds } },
      orderBy: { createdAt: "asc" },
      select: { ticketId: true, direction: true, createdAt: true },
    });
    // Per-ticket cursor: walk in chronological order, remember the last SA
    // outbound timestamp, and flip customerRepliedFast when an INBOUND lands
    // within 3 days of it. This matches the spec: the customer answered
    // quickly after our reply.
    const lastOutbound = new Map<string, number>();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const m of msgs) {
      const s = stats.get(m.ticketId);
      if (!s) continue;
      const t = new Date(m.createdAt).getTime();
      if (!s.firstAt || m.createdAt < s.firstAt) s.firstAt = m.createdAt;
      if (m.direction === "INBOUND") {
        s.inbound++;
        if (!s.lastInboundAt || m.createdAt > s.lastInboundAt)
          s.lastInboundAt = m.createdAt;
        const lo = lastOutbound.get(m.ticketId);
        if (lo !== undefined && t - lo <= 3 * dayMs) {
          s.customerRepliedFast = true;
        }
      } else if (m.direction === "OUTBOUND") {
        s.outbound++;
        lastOutbound.set(m.ticketId, t);
      } else {
        s.notes++;
      }
    }
  }

  // Build a query string that preserves all current filters so pagination
  // doesn't accidentally reset the SA's view.
  const baseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string" && v && k !== "page") baseParams.set(k, v);
  }
  const linkFor = (p: number) => {
    const params = new URLSearchParams(baseParams);
    params.set("page", String(p));
    return `/sa/support?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/sa/dashboard" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <Inbox className="h-6 w-6 text-brand-400" />
            <div>
              <h1 className="text-2xl font-bold">{t("nav.support")}</h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {t("support.tickets", {
                  totalCount,
                  openCount,
                  pendingCount,
                })}
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/sa/support/blocklist"
          className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300"
        >
          {t("support.blocklist")}
        </Link>
      </div>

      <SaLiveFilters
        fields={[
          {
            name: "status",
            kind: "select",
            options: [
              { value: "", label: t("support.openPending") },
              { value: "OPEN", label: t("support.open") },
              { value: "PENDING", label: t("support.pendingUser") },
              { value: "CLOSED", label: t("support.closed") },
              { value: "ALL", label: t("support.allStatuses") },
            ],
          },
          { name: "tenantId", kind: "text", placeholder: t("support.tenantIdLabel") },
          { name: "clinicQ", kind: "text", placeholder: t("support.clinicLabel") },
          { name: "userQ", kind: "text", placeholder: t("support.userLabel") },
          { name: "fromEmail", kind: "text", placeholder: t("support.senderEmailLabel") },
          { name: "since", kind: "date" },
          { name: "until", kind: "date" },
        ]}
      />

      <SupportActiveChips />
      <SupportAutoRefresh />

      {warning && (
        <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-200 text-sm rounded-lg px-4 py-2">
          {warning}
        </div>
      )}

      <SupportBulkActions ticketIds={tickets.map((t) => t.id)} />

      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-600 dark:text-gray-400">
              <th className="p-4 w-8">
                <SupportMasterCheckbox />
              </th>
              <th className="p-4">{t("support.status")}</th>
              <th className="p-4">{t("support.subject")}</th>
              <th className="p-4">{t("support.from")}</th>
              <th className="p-4">{t("support.clinic")}</th>
              <th className="p-4">Tenant ID</th>
              <th className="p-4">{t("support.lastMessage")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  {t("support.notFound")}
                </td>
              </tr>
            ) : (
              tickets.map((tk) => (
                <tr key={tk.id} className="hover:bg-gray-100 dark:hover:bg-gray-800/50">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      data-support-ticket-cb="1"
                      value={tk.id}
                      className="accent-brand-500"
                      aria-label={`Selecionar ticket ${tk.id}`}
                    />
                  </td>
                  <td className="p-4">
                    <StatusPill status={tk.status} t={t} />
                  </td>
                  <td className="p-4">
                    <Link href={`/sa/support/${tk.id}`} className="block hover:underline">
                      {tk.subject || t("support.noSubject")}
                    </Link>
                    <TicketBadges
                      stats={stats.get(tk.id)}
                      status={tk.status}
                      lastMessageAt={tk.lastMessageAt}
                      t={t}
                    />
                  </td>
                  <td className="p-4 text-xs text-gray-600 dark:text-gray-400">
                    {tk.fromName ? `${tk.fromName} · ` : ""}
                    {tk.fromEmail}
                  </td>
                  <td className="p-4 text-xs">
                    {tk.tenantId && tenantMap.has(tk.tenantId) ? (
                      <Link
                        href={`/sa/tenants/${tk.tenantId}`}
                        className="text-brand-400 hover:underline"
                      >
                        {tenantMap.get(tk.tenantId)}
                      </Link>
                    ) : (
                      <span className="text-gray-500 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-4 text-xs text-gray-600 dark:text-gray-500 font-mono">
                    {tk.tenantId ? tk.tenantId.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="p-4 text-xs text-gray-600 dark:text-gray-400">
                    {new Date(tk.lastMessageAt).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("tenants.pagination", { page, total: pageCount })}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={linkFor(page - 1)}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-sm"
              >
                {t("tenants.previous")}
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={linkFor(page + 1)}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded text-sm"
              >
                {t("tenants.next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TicketBadges({
  stats,
  status,
  lastMessageAt,
  t,
}: {
  stats:
    | {
        inbound: number;
        outbound: number;
        notes: number;
        firstAt: Date | null;
        lastInboundAt: Date | null;
        customerRepliedFast: boolean;
      }
    | undefined;
  status: "OPEN" | "PENDING" | "CLOSED";
  lastMessageAt: Date;
  t: any;
}) {
  if (!stats) return null;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // "Rotten" = days since the last inbound the customer sent us. Only
  // surfaced when the ball is in our court (status OPEN).
  const rottenSrc = stats.lastInboundAt ?? lastMessageAt;
  const rottenDays = Math.floor((now - new Date(rottenSrc).getTime()) / dayMs);
  // "Open since" = age of the very first message on the ticket.
  const openSinceDays = stats.firstAt
    ? Math.floor((now - new Date(stats.firstAt).getTime()) / dayMs)
    : null;
  // One Stop Shop = the customer replied to one of our outbound messages
  // within 3 days. Recognises engaged customers / well-resolved threads.
  const oss = stats.customerRepliedFast;

  const totalMsgs = stats.inbound + stats.outbound;
  return (
    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
      {totalMsgs > 0 && (
        <span
          className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          title={`${stats.inbound} ${t("support.received")} · ${stats.outbound} ${t("support.sent")}`}
        >
          ✉ {totalMsgs}
        </span>
      )}
      {stats.notes > 0 && (
        <span
          className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-200"
          title={`${stats.notes} ${t("support.internalNotes")}`}
        >
          🔒 {stats.notes}
        </span>
      )}
      {openSinceDays !== null && (
        <span
          className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-400"
          title="Aberto há (dias desde a primeira mensagem)"
        >
          ⏱ {openSinceDays}d
        </span>
      )}
      {status === "OPEN" && rottenDays >= 2 && (
        <span
          className={
            "px-1.5 py-0.5 rounded border " +
            (rottenDays >= 7
              ? "bg-red-100 dark:bg-red-900/50 border-red-300 dark:border-red-800 text-red-700 dark:text-red-200"
              : "bg-amber-100 dark:bg-yellow-900/40 border-amber-300 dark:border-yellow-800 text-amber-700 dark:text-yellow-200")
          }
          title="Dias sem retorno do cliente / sem ação"
        >
          🥀 {rottenDays}d
        </span>
      )}
      {oss && (
        <span
          className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-200"
          title="Resolvido na primeira resposta em até 3 dias"
        >
          ⭐ One Stop Shop
        </span>
      )}
    </div>
  );
}

function StatusPill({ status, t }: { status: "OPEN" | "PENDING" | "CLOSED"; t: any }) {
  const map = {
    OPEN: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
    PENDING: "bg-amber-100 dark:bg-yellow-900/50 text-amber-700 dark:text-yellow-300 border-amber-300 dark:border-yellow-800",
    CLOSED: "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border-gray-300 dark:border-gray-700",
  };
  const labelMap = {
    OPEN: t("support.statusOpen"),
    PENDING: t("support.statusPending"),
    CLOSED: t("support.statusClosed"),
  };
  return (
    <span className={`px-2 py-1 rounded border text-xs ${map[status]}`}>
      {labelMap[status]}
    </span>
  );
}
