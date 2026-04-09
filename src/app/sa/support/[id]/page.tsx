import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { parseBodyWrapper, sanitizeSupportHtml } from "@/lib/support-sanitize";
import { SupportTicketActions } from "@/components/sa/support-ticket-actions";
import { SupportMessageHtml } from "@/components/sa/support-message-html";

export const metadata = { title: "Ticket — Suporte" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SupportTicketPage({
  params,
}: {
  params: { id: string };
}) {
  await requireSuperAdmin();
  if (!UUID_RE.test(params.id)) notFound();

  const ticket = await db.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      // Newest first so the most recent activity sits at the top of the
      // timeline directly under the composer.
      messages: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!ticket) notFound();

  const tenant = ticket.tenantId
    ? await db.tenant.findUnique({
        where: { id: ticket.tenantId },
        select: { id: true, name: true, slug: true },
      })
    : null;

  // Decrypt each message body server-side. If a row is corrupt we display
  // a marker instead of crashing the whole page.
  const decryptedMessages = await Promise.all(
    ticket.messages.map(async (m) => {
      try {
        const raw = await decrypt(m.bodyEncrypted);
        const { text, html } = parseBodyWrapper(raw);
        // Sanitize HTML server-side BEFORE shipping to the client iframe.
        const safeHtml = html ? sanitizeSupportHtml(html) : "";
        return { ...m, text, safeHtml, error: false };
      } catch {
        return {
          ...m,
          text: "[não foi possível descriptografar esta mensagem]",
          safeHtml: "",
          error: true,
        };
      }
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sa/support" className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{ticket.subject || "(sem assunto)"}</h1>
          <p className="text-gray-400 text-sm">
            {ticket.fromName ? `${ticket.fromName} · ` : ""}
            {ticket.fromEmail}
            {tenant && (
              <>
                {" · "}
                <Link href={`/sa/tenants/${tenant.id}`} className="text-brand-400 hover:underline">
                  {tenant.name}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <SupportTicketActions ticketId={ticket.id} currentStatus={ticket.status} />

      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        {decryptedMessages.map((m) => (
          <div
            key={m.id}
            className={
              "p-4 " +
              (m.direction === "INTERNAL"
                ? "bg-amber-950/30 border-l-4 border-amber-600"
                : "")
            }
          >
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span
                className={
                  m.direction === "INBOUND"
                    ? "text-blue-300 font-medium"
                    : m.direction === "OUTBOUND"
                    ? "text-green-300 font-medium"
                    : "text-amber-300 font-medium"
                }
              >
                {m.direction === "INBOUND"
                  ? "↓ Recebido"
                  : m.direction === "OUTBOUND"
                  ? "↑ Enviado"
                  : "🔒 Nota interna (staff apenas)"}
              </span>
              <span>{new Date(m.createdAt).toLocaleString("pt-BR")}</span>
            </div>
            {m.safeHtml ? (
              <SupportMessageHtml html={m.safeHtml} />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-gray-200 font-sans">
                {m.text}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
