import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, fmt = "dd/MM/yyyy"): string {
  return format(new Date(date), fmt, { locale: ptBR });
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function formatTime(date: Date | string): string {
  return format(new Date(date), "HH:mm");
}

export function formatRelative(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
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
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
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

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    SUPERADMIN: "Super Admin",
    TENANT_ADMIN: "Administrador",
    PSYCHOLOGIST: "Psicólogo(a)",
    ASSISTANT: "Assistente",
    READONLY: "Leitor",
  };
  return labels[role] ?? role;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
