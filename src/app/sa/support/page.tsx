import { requireSuperAdmin } from "@/lib/auth";
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

export const metadata = { title: "Suporte — SuperAdmin" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_TEXT_RE = /^[a-zA-Z0-9\u00C0-\u024F\s._\-+@]+$/;

export default async function SASupportPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireSuperAdmin();

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
      warning = "Email inválido.";
    } else {
      where.fromEmail = { contains: fromEmail, mode: "insensitive" };
    }
  }

  const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

  // Clinic filter — resolve Tenant.name/slug contains → tenantId list
  const clinicQ = ((searchParams.clinicQ as string) || "").trim();
  if (clinicQ) {
    if (!SAFE_TEXT_RE.test(clinicQ)) {
      warning = (warning ? warning + " " : "") + "Clínica inválida.";
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
        warning = (warning ? warning + " " : "") + "Clínica inválida.";
      }
    }
  }

  // User filter — match against the ticket itself (fromEmail / fromName) since
  // many senders don't have a linked User row. "moyses" should hit every ticket
  // whose fromEmail or fromName contains that substring.
  const userQ = ((searchParams.userQ as string) || "").trim();
  if (userQ) {
    if (!SAFE_TEXT_RE.test(userQ)) {
      warning = (warning ? warning + " " : "") + "Usuário inválido.";
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
          <Link href="/sa/dashboard" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <Inbox className="h-6 w-6 text-brand-400" />
            <div>
              <h1 className="text-2xl font-bold">Suporte</h1>
              <p className="text-gray-400 text-sm">
                {totalCount} tickets ({openCount} abertos, {pendingCount} aguardando)
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/sa/support/blocklist"
          className="px-3 py-1.5 rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-sm text-gray-300"
        >
          Blocklist
        </Link>
      </div>

      <SaLiveFilters
        fields={[
          {
            name: "status",
            kind: "select",
            options: [
              { value: "", label: "Abertos + Aguardando" },
              { value: "OPEN", label: "Abertos" },
              { value: "PENDING", label: "Aguardando usuário" },
              { value: "CLOSED", label: "Fechados" },
              { value: "ALL", label: "Todos status" },
            ],
          },
          { name: "tenantId", kind: "text", placeholder: "Tenant ID (UUID)" },
          { name: "clinicQ", kind: "text", placeholder: "Clínica — nome ou slug" },
          { name: "userQ", kind: "text", placeholder: "Usuário — email ou nome" },
          { name: "fromEmail", kind: "text", placeholder: "Email do remetente" },
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

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-xs text-gray-400">
              <th className="p-4 w-8">
                <SupportMasterCheckbox />
              </th>
              <th className="p-4">Status</th>
              <th className="p-4">Assunto</th>
              <th className="p-4">De</th>
              <th className="p-4">Clínica</th>
              <th className="p-4">Tenant ID</th>
              <th className="p-4">Última mensagem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  Nenhum ticket encontrado.
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr key={t.id} className="hover:bg-gray-800/50">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      data-support-ticket-cb="1"
                      value={t.id}
                      className="accent-brand-500"
                      aria-label={`Selecionar ticket ${t.id}`}
                    />
                  </td>
                  <td className="p-4">
                    <StatusPill status={t.status} />
                  </td>
                  <td className="p-4">
                    <Link href={`/sa/support/${t.id}`} className="block hover:underline">
                      {t.subject || "(sem assunto)"}
                    </Link>
                    <TicketBadges
                      stats={stats.get(t.id)}
                      status={t.status}
                      lastMessageAt={t.lastMessageAt}
                    />
                  </td>
                  <td className="p-4 text-xs text-gray-400">
                    {t.fromName ? `${t.fromName} · ` : ""}
                    {t.fromEmail}
                  </td>
                  <td className="p-4 text-xs">
                    {t.tenantId && tenantMap.has(t.tenantId) ? (
                      <Link
                        href={`/sa/tenants/${t.tenantId}`}
                        className="text-brand-400 hover:underline"
                      >
                        {tenantMap.get(t.tenantId)}
                      </Link>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-4 text-xs text-gray-500 font-mono">
                    {t.tenantId ? t.tenantId.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="p-4 text-xs text-gray-400">
                    {new Date(t.lastMessageAt).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Página {page} de {pageCount}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={linkFor(page - 1)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
              >
                Anterior
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={linkFor(page + 1)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm"
              >
                Próxima
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
          className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300"
          title={`${stats.inbound} recebidas · ${stats.outbound} enviadas`}
        >
          ✉ {totalMsgs}
        </span>
      )}
      {stats.notes > 0 && (
        <span
          className="px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-800 text-amber-200"
          title={`${stats.notes} nota(s) interna(s)`}
        >
          🔒 {stats.notes}
        </span>
      )}
      {openSinceDays !== null && (
        <span
          className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400"
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
              ? "bg-red-900/50 border-red-800 text-red-200"
              : "bg-yellow-900/40 border-yellow-800 text-yellow-200")
          }
          title="Dias sem retorno do cliente / sem ação"
        >
          🥀 {rottenDays}d
        </span>
      )}
      {oss && (
        <span
          className="px-1.5 py-0.5 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-200"
          title="Resolvido na primeira resposta em até 3 dias"
        >
          ⭐ One Stop Shop
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "OPEN" | "PENDING" | "CLOSED" }) {
  const map = {
    OPEN: "bg-red-900/50 text-red-300 border-red-800",
    PENDING: "bg-yellow-900/50 text-yellow-300 border-yellow-800",
    CLOSED: "bg-gray-800 text-gray-400 border-gray-700",
  };
  const label = { OPEN: "Aberto", PENDING: "Aguardando", CLOSED: "Fechado" }[status];
  return (
    <span className={`px-2 py-1 rounded border text-xs ${map[status]}`}>{label}</span>
  );
}
