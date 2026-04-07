/**
 * Email service — Psycologger
 * Uses Resend. Falls back to console log in development.
 */

import { Resend } from "resend";
import { roleLabel } from "@/lib/utils";

// Lazy-initialize the Resend client so env vars are available at call time,
// not at module-load time (important for Vercel/serverless cold starts).
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    if (key.startsWith("re_test_")) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "RESEND_API_KEY cannot be a test key (re_test_*) in production. " +
          "Use a live key and verify your domain at https://resend.com/domains."
        );
      }
      console.warn(
        "[email] WARNING: Using a Resend TEST API key (re_test_*). " +
        "Emails will ONLY be delivered to the account owner's verified email. " +
        "Switch to a live key (re_*) and verify your domain to send to all recipients."
      );
    }
    _resend = new Resend(key);
  }
  return _resend;
}

function getFromEmail(): string {
  return process.env.EMAIL_FROM ?? "Psycologger <noreply@psycologger.com>";
}

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// ─── HTML escaping ────────────────────────────────────────────────────────────
// All user-supplied values interpolated into HTML must go through esc() to
// prevent XSS in email clients.

function esc(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ─── Magic Link ───────────────────────────────────────────────────────────────

export async function sendMagicLink({
  to,
  url,
  name,
  tenantId,
}: {
  to: string;
  url: string;
  name?: string;
  tenantId?: string;
}) {
  const subject = "Seu link de acesso ao Psycologger";
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <img src="${esc(APP_URL)}/logo.png" alt="Psycologger" style="height:40px; margin-bottom:24px;" />
      <h2 style="color:#1e3a8a;">Acesso ao Psycologger</h2>
      <p>Olá${name ? `, ${esc(name)}` : ""}! Clique no botão abaixo para entrar na sua conta.</p>
      <a href="${esc(url)}" style="
        display:inline-block;
        padding:12px 28px;
        background:#2563eb;
        color:#fff;
        border-radius:8px;
        text-decoration:none;
        font-size:16px;
        font-weight:600;
        margin:16px 0;
      ">Entrar na minha conta</a>
      <p style="color:#6b7280; font-size:13px;">
        Este link expira em 24 horas e só pode ser usado uma vez.<br/>
        Se você não solicitou o acesso, pode ignorar este email.
      </p>
      <p style="color:#9ca3af; font-size:12px; margin-top:32px;">
        Psycologger — Gestão para psicólogos
      </p>
    </div>
  `;

  return sendEmail({ to, subject, html, tenantId });
}

// ─── Invite ───────────────────────────────────────────────────────────────────

export async function sendInviteEmail({
  to,
  inviteUrl,
  tenantName,
  role,
  inviterName,
}: {
  to: string;
  inviteUrl: string;
  tenantName: string;
  role: string;
  inviterName?: string;
}) {
  const subject = `Convite para ${esc(tenantName)} no Psycologger`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e3a8a;">Você foi convidado!</h2>
      <p>${inviterName ? `<strong>${esc(inviterName)}</strong> convidou você` : "Você foi convidado"} para ingressar em <strong>${esc(tenantName)}</strong> no Psycologger como <strong>${esc(roleLabel(role))}</strong>.</p>
      <a href="${esc(inviteUrl)}" style="
        display:inline-block;
        padding:12px 28px;
        background:#2563eb;
        color:#fff;
        border-radius:8px;
        text-decoration:none;
        font-size:16px;
        font-weight:600;
        margin:16px 0;
      ">Aceitar convite</a>
      <p style="color:#6b7280; font-size:13px;">
        Este convite expira em 7 dias. Caso não reconheça este convite, ignore este email.
      </p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

// ─── Appointment Reminders ────────────────────────────────────────────────────

export async function sendAppointmentConfirmation({
  to,
  patientName,
  appointmentDate,
  appointmentTime,
  clinicName,
  location,
  videoLink,
}: {
  to: string;
  patientName: string;
  appointmentDate: string;
  appointmentTime: string;
  clinicName: string;
  location?: string;
  videoLink?: string;
}) {
  const subject = `Confirmação de consulta — ${esc(clinicName)}`;
  const locationHtml = videoLink
    ? `<p>Link para consulta online: <a href="${esc(videoLink)}">${esc(videoLink)}</a></p>`
    : location
    ? `<p>Local: ${esc(location)}</p>`
    : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e3a8a;">Consulta confirmada</h2>
      <p>Olá, ${esc(patientName)}!</p>
      <p>Sua consulta em <strong>${esc(clinicName)}</strong> está confirmada:</p>
      <div style="background:#f1f5f9; padding:16px; border-radius:8px; margin:16px 0;">
        <p style="margin:4px 0;"><strong>Data:</strong> ${esc(appointmentDate)}</p>
        <p style="margin:4px 0;"><strong>Horário:</strong> ${esc(appointmentTime)}</p>
        ${locationHtml}
      </div>
      <p style="color:#6b7280; font-size:13px;">Em caso de dúvidas ou necessidade de reagendamento, entre em contato com a clínica.</p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

export async function sendAppointmentReminder({
  to,
  patientName,
  appointmentDate,
  appointmentTime,
  clinicName,
}: {
  to: string;
  patientName: string;
  appointmentDate: string;
  appointmentTime: string;
  clinicName: string;
}) {
  const subject = `Lembrete: consulta amanhã — ${esc(clinicName)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e3a8a;">Lembrete de consulta</h2>
      <p>Olá, ${esc(patientName)}!</p>
      <p>Lembramos que você tem uma consulta agendada <strong>amanhã</strong>:</p>
      <div style="background:#f1f5f9; padding:16px; border-radius:8px; margin:16px 0;">
        <p style="margin:4px 0;"><strong>Data:</strong> ${esc(appointmentDate)}</p>
        <p style="margin:4px 0;"><strong>Horário:</strong> ${esc(appointmentTime)}</p>
      </div>
      <p style="color:#6b7280; font-size:13px;">Em caso de necessidade de cancelamento ou reagendamento, entre em contato com ${esc(clinicName)}.</p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

// ─── Payment Reminders ───────────────────────────────────────────────────

export async function sendPaymentCreatedNotification({
  to,
  patientName,
  clinicName,
  amountFormatted,
  dueDate,
  description,
}: {
  to: string;
  patientName: string;
  clinicName: string;
  amountFormatted: string;
  dueDate: string;
  description?: string;
}) {
  const subject = `Nova cobrança — ${esc(clinicName)}`;
  const descHtml = description
    ? `<p style="margin:4px 0;"><strong>Descrição:</strong> ${esc(description)}</p>`
    : "";

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e3a8a;">Nova cobrança</h2>
      <p>Olá, ${esc(patientName)}!</p>
      <p>Uma nova cobrança foi registrada em <strong>${esc(clinicName)}</strong>:</p>
      <div style="background:#f1f5f9; padding:16px; border-radius:8px; margin:16px 0;">
        <p style="margin:4px 0;"><strong>Valor:</strong> ${esc(amountFormatted)}</p>
        <p style="margin:4px 0;"><strong>Vencimento:</strong> ${esc(dueDate)}</p>
        ${descHtml}
      </div>
      <p style="color:#6b7280; font-size:13px;">Em caso de dúvidas, entre em contato com a clínica.</p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

export async function sendPaymentDueReminder({
  to,
  patientName,
  clinicName,
  amountFormatted,
  dueDate,
  tenantId,
  chargeId,
}: {
  to: string;
  patientName: string;
  clinicName: string;
  amountFormatted: string;
  dueDate: string;
  tenantId?: string;
  chargeId?: string;
}) {
  const subject = `Lembrete: cobrança vence amanhã — ${esc(clinicName)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e3a8a;">Lembrete de pagamento</h2>
      <p>Olá, ${esc(patientName)}!</p>
      <p>Lembramos que você tem uma cobrança com vencimento <strong>amanhã</strong>:</p>
      <div style="background:#f1f5f9; padding:16px; border-radius:8px; margin:16px 0;">
        <p style="margin:4px 0;"><strong>Valor:</strong> ${esc(amountFormatted)}</p>
        <p style="margin:4px 0;"><strong>Vencimento:</strong> ${esc(dueDate)}</p>
      </div>
      <p style="color:#6b7280; font-size:13px;">Em caso de dúvidas, entre em contato com ${esc(clinicName)}.</p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html,
    tenantId,
    relatedEntityType: chargeId ? "Charge" : undefined,
    relatedEntityId: chargeId,
  });
}

export async function sendPaymentOverdueNotification({
  to,
  patientName,
  clinicName,
  amountFormatted,
  dueDate,
  tenantId,
  chargeId,
}: {
  to: string;
  patientName: string;
  clinicName: string;
  amountFormatted: string;
  dueDate: string;
  tenantId?: string;
  chargeId?: string;
}) {
  const subject = `Cobrança em atraso — ${esc(clinicName)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#c2410c;">Cobrança em atraso</h2>
      <p>Olá, ${esc(patientName)}!</p>
      <p>Identificamos uma cobrança em atraso:</p>
      <div style="background:#fff7ed; padding:16px; border-radius:8px; margin:16px 0; border-left:4px solid #ea580c;">
        <p style="margin:4px 0;"><strong>Valor:</strong> ${esc(amountFormatted)}</p>
        <p style="margin:4px 0;"><strong>Vencimento:</strong> ${esc(dueDate)}</p>
      </div>
      <p style="color:#6b7280; font-size:13px;">Por favor, entre em contato com ${esc(clinicName)} para regularizar.</p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    html,
    tenantId,
    relatedEntityType: chargeId ? "Charge" : undefined,
    relatedEntityId: chargeId,
  });
}

// ─── Patient Portal Emails ──────────────────────────────────────────────────

export async function sendPortalInviteEmail({
  to,
  activateUrl,
  patientName,
  tenantName,
}: {
  to: string;
  activateUrl: string;
  patientName: string;
  tenantName: string;
}) {
  const subject = `Convite para o Portal do Paciente — ${esc(tenantName)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e3a8a;">Portal do Paciente</h2>
      <p>Olá, ${esc(patientName)}!</p>
      <p><strong>${esc(tenantName)}</strong> convidou você para acessar o Portal do Paciente.</p>
      <p>No portal, você poderá:</p>
      <ul style="color:#374151; font-size:14px;">
        <li>Ver suas sessões agendadas</li>
        <li>Acompanhar pagamentos</li>
        <li>Manter um diário de humor e reflexões</li>
      </ul>
      <div style="text-align:center; margin:24px 0;">
        <a href="${esc(activateUrl)}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 32px; border-radius:8px; font-weight:600;">
          Ativar minha conta
        </a>
      </div>
      <p style="color:#6b7280; font-size:13px;">Se você não esperava este convite, pode ignorar este email.</p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

// ─── Patient Portal Password Reset ──────────────────────────────────────────

export async function sendPortalPasswordResetEmail({
  to,
  resetUrl,
  patientName,
  tenantName,
}: {
  to: string;
  resetUrl: string;
  patientName: string;
  tenantName: string;
}) {
  const subject = `Redefinição de senha — ${esc(tenantName)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e3a8a;">Redefinir senha</h2>
      <p>Olá, ${esc(patientName)}!</p>
      <p>Recebemos uma solicitação para redefinir a senha da sua conta no portal de <strong>${esc(tenantName)}</strong>.</p>
      <div style="text-align:center; margin:24px 0;">
        <a href="${esc(resetUrl)}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 32px; border-radius:8px; font-weight:600;">
          Redefinir minha senha
        </a>
      </div>
      <p style="color:#6b7280; font-size:13px;">
        Este link expira em 1 hora e só pode ser usado uma vez.<br/>
        Se você não solicitou essa redefinição, ignore este email — sua senha permanece inalterada.
      </p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

// ─── Patient Portal Magic Link ──────────────────────────────────────────────────

export async function sendPortalMagicLinkEmail({
  to,
  magicUrl,
  patientName,
  tenantName,
}: {
  to: string;
  magicUrl: string;
  patientName: string;
  tenantName: string;
}) {
  const subject = `Seu link de acesso — ${esc(tenantName)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
      <h2 style="color:#1e3a8a;">Acesso ao Portal</h2>
      <p>Olá, ${esc(patientName)}!</p>
      <p>Clique no botão abaixo para acessar o portal de <strong>${esc(tenantName)}</strong> sem precisar digitar sua senha.</p>
      <div style="text-align:center; margin:24px 0;">
        <a href="${esc(magicUrl)}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 32px; border-radius:8px; font-weight:600;">
          Acessar o portal
        </a>
      </div>
      <p style="color:#6b7280; font-size:13px;">
        Este link expira em 30 minutos e só pode ser usado uma vez.<br/>
        Se você não solicitou o acesso, ignore este email.
      </p>
    </div>
  `;

  return sendEmail({ to, subject, html });
}

// ─── Base send ────────────────────────────────────────────────────────────────

async function sendEmail({
  to,
  subject,
  html,
  tenantId,
  relatedEntityType,
  relatedEntityId,
}: {
  to: string;
  subject: string;
  html: string;
  tenantId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}) {
  // Validate email format to prevent injection
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) {
    throw new Error(`Invalid email address format`);
  }

  if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
    console.log(`[email:DEV] To: ${to}\nSubject: ${subject}\n---`);
    return { id: "dev-email-id" };
  }

  const fromEmail = getFromEmail();
  const resend = getResend();

  // Extract the domain from the from address for diagnostics
  const fromDomainMatch = fromEmail.match(/@([^>]+)/);
  const fromDomain = fromDomainMatch?.[1]?.trim();

  console.log(
    `[email] Sending to="${to}" from="${fromEmail}" (domain=${fromDomain}) subject="${subject}"`
  );

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to], // Resend v4 prefers array format
    subject,
    html,
  });

  if (error) {
    // Log safe error details — never log full error object which may contain
    // sensitive headers, tokens, or PII from Resend API responses
    const errObj = error as unknown as Record<string, unknown>;
    console.error(
      `[email] Resend FAILED statusCode=${errObj.statusCode ?? "?"} ` +
      `name=${errObj.name ?? "?"} message="${error.message}"`
    );

    // Surface actionable advice for common errors
    if (errObj.statusCode === 403) {
      console.error(
        `[email] 403 Forbidden — likely causes:\n` +
        `  1. Domain "${fromDomain}" is not verified in your Resend dashboard\n` +
        `  2. Using a test API key (re_test_*) — only sends to the account owner email\n` +
        `  3. DNS records (DKIM/SPF) not fully propagated yet\n` +
        `  Fix: Go to https://resend.com/domains and verify that "${fromDomain}" shows status "Verified"`
      );
    }
    if (errObj.statusCode === 422) {
      console.error(
        `[email] 422 Validation Error — check that "to" address "${to}" is valid ` +
        `and "from" address "${fromEmail}" is correctly formatted as "Name <email@domain>"`
      );
    }

    throw new Error(
      `Email send failed (${errObj.statusCode ?? "unknown"}): ${error.message}`
    );
  }

  console.log(`[email] Sent OK id=${data?.id} to="${to}"`);

  // Track email in DB if tenantId is provided (for Resend webhook tracking)
  if (tenantId && data?.id) {
    try {
      const { db } = await import("@/lib/db");
      await db.emailReminder.create({
        data: {
          tenantId,
          recipient: to,
          subject,
          body: html,
          resendMessageId: data.id,
          lastEmailStatus: "sent",
          lastEmailStatusAt: new Date(),
          relatedEntityType: relatedEntityType || null,
          relatedEntityId: relatedEntityId || null,
        },
      });
    } catch (err) {
      console.error(
        `[email] Failed to track email in DB:`,
        err instanceof Error ? err.message : "Unknown error"
      );
      // Don't fail the email send if tracking fails
    }
  }

  return data;
}

// roleLabel imported from @/lib/utils
