import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR, enUS, es, he, it, fr, de } from "date-fns/locale";
import type { Locale as DateFnsLocale } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map app locale codes to date-fns locale objects */
const dateFnsLocales: Record<string, DateFnsLocale> = {
  "pt-BR": ptBR,
  en: enUS,
  es: es,
  he: he,
  it: it,
  fr: fr,
  de: de,
};

/**
 * Resolve the current app locale from the NEXT_LOCALE cookie (client-side)
 * or fall back to pt-BR. Used by formatting functions.
 */
function getDateFnsLocale(): DateFnsLocale {
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|; )NEXT_LOCALE=([^;]+)/);
    if (match) return dateFnsLocales[match[1]] ?? ptBR;
    // Fall back to html lang attribute
    const htmlLang = document.documentElement.lang;
    if (htmlLang && dateFnsLocales[htmlLang]) return dateFnsLocales[htmlLang];
  }
  return ptBR;
}

export function formatDate(date: Date | string, fmt = "dd/MM/yyyy"): string {
  return format(new Date(date), fmt, { locale: getDateFnsLocale() });
}

export function formatDateTime(date: Date | string): string {
  const loc = getDateFnsLocale();
  // Use locale-appropriate connector between date and time
  const connector = loc === ptBR ? "'às'" : loc === es ? "'a las'" : "','";
  return format(new Date(date), `dd/MM/yyyy ${connector} HH:mm`, { locale: loc });
}

export function formatTime(date: Date | string): string {
  return format(new Date(date), "HH:mm");
}

export function formatRelative(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: getDateFnsLocale() });
}

/**
 * Format a date for display headings (e.g. "Saturday, April 11").
 * Uses Intl.DateTimeFormat for proper locale support.
 */
export function formatDateHeading(date: Date | string): string {
  const d = new Date(date);
  let locale = "pt-BR";
  if (typeof document !== "undefined") {
    const match = document.cookie.match(/(?:^|; )NEXT_LOCALE=([^;]+)/);
    if (match) locale = match[1];
    else {
      const htmlLang = document.documentElement.lang;
      if (htmlLang) locale = htmlLang;
    }
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

/**
 * Server-side locale-aware date heading. Accepts explicit locale string
 * since server components can't read cookies via document.cookie.
 */
export function formatDateHeadingServer(date: Date | string, locale = "pt-BR"): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

/** Convert a decimal amount (e.g. 79.90) to integer cents (7990). */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer cents (7990) to a decimal amount (79.9). */
export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatCurrency(cents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateSlug(name: string): string {
  const base = slugify(name);
  // Use crypto-safe random instead of Math.random() to prevent predictable slugs
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 7);
  return `${base}-${suffix}`;
}

/** Escape a string for safe CSV output (prevents formula injection and quote issues). */
export function csvSafe(value: string): string {
  let v = value.replace(/"/g, '""');
  v = v.replace(/[\r\n]+/g, " "); // flatten newlines to prevent CSV row breaks
  // Prevent formula injection: prefix with single quote if starts with =, +, -, @, \t, \r
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return `"${v}"`;
}

/** Format a currency value for cron/email contexts (BRL, no external deps). */
export function formatCurrencyPlain(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** Format a date for cron/email contexts (dd/MM/yyyy, no external deps). */
export function formatDatePlain(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function chargeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    PAID: "Pago",
    OVERDUE: "Vencido",
    VOID: "Cancelado",
    REFUNDED: "Reembolsado",
  };
  return labels[status] ?? status;
}

export function appointmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    SCHEDULED: "Agendado",
    CONFIRMED: "Confirmado",
    COMPLETED: "Realizado",
    CANCELED: "Cancelado",
    NO_SHOW: "Faltou",
  };
  return labels[status] ?? status;
}

export function paymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    PIX: "Pix",
    CASH: "Dinheiro",
    CARD: "Cartão",
    TRANSFER: "Transferência",
    INSURANCE: "Convênio",
    OTHER: "Outro",
  };
  return labels[method] ?? method;
}

// ─── i18n Key Helpers (for use in client components with useTranslations) ────

export function chargeStatusKey(status: string): string {
  const keys: Record<string, string> = {
    PENDING: "charges.statusPending",
    PAID: "charges.statusPaid",
    OVERDUE: "charges.statusOverdue",
    VOID: "charges.statusVoid",
    REFUNDED: "charges.statusRefunded",
    PARTIALLY_PAID: "charges.statusPartiallyPaid",
  };
  return keys[status] ?? status;
}

export function appointmentStatusKey(status: string): string {
  const keys: Record<string, string> = {
    SCHEDULED: "appointments.statusScheduled",
    CONFIRMED: "appointments.statusConfirmed",
    COMPLETED: "appointments.statusCompleted",
    CANCELED: "appointments.statusCanceled",
    NO_SHOW: "appointments.statusNoShow",
  };
  return keys[status] ?? status;
}

export function paymentMethodKey(method: string): string {
  const keys: Record<string, string> = {
    PIX: "charges.pix",
    CASH: "charges.cash",
    CARD: "charges.card",
    TRANSFER: "charges.transfer",
    INSURANCE: "charges.insurance",
    OTHER: "charges.other",
  };
  return keys[method] ?? method;
}

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    SUPERADMIN: "Super Administrador",
    TENANT_ADMIN: "Administrador",
    PSYCHOLOGIST: "Psicólogo(a)",
    ASSISTANT: "Assistente",
    READONLY: "Leitor",
  };
  return labels[role] ?? role;
}

/**
 * Extract a user-friendly error message from an API response.
 * Handles the standard { error: { message } } shape returned by our API layer.
 */
export async function extractApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.error?.message ?? data?.error ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Extract an error message from a caught exception.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
