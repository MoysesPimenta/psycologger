/**
 * Email service — Psycologger
 * Uses Resend. Falls back to console log in development.
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM ?? "Psycologger <noreply@psycologger.com>";
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
}: {
  to: string;
  url: string;
  name?: string;
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

  return sendEmail({ to, subject, html });
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
}: {
  to: string;
  patientName: string;
  clinicName: string;
  amountFormatted: string;
  dueDate: string;
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

  return sendEmail({ to, subject, html });
}

export async function sendPaymentOverdueNotification({
  to,
  patientName,
  clinicName,
  amountFormatted,
  dueDate,
}: {
  to: string;
  patientName: string;
  clinicName: string;
  amountFormatted: string;
  dueDate: string;
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

  return sendEmail({ to, subject, html });
}

// ─── Base send ────────────────────────────────────────────────────────────────

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
    console.log(`[email:DEV] To: ${to}\nSubject: ${subject}\n---`);
    return { id: "dev-email-id" };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[email] Resend error:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  return data;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    TENANT_ADMIN: "Administrador",
    PSYCHOLOGIST: "Psicólogo(a)",
    ASSISTANT: "Assistente/Faturamento",
    READONLY: "Leitor",
  };
  return labels[role] ?? role;
}
