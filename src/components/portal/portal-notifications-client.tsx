"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, Check, Calendar, CreditCard, PenLine, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  SESSION_REMINDER: Calendar,
  PAYMENT_REMINDER: CreditCard,
  PRE_SESSION_PROMPT: PenLine,
  ENTRY_REVIEWED: Check,
  GENERAL: Info,
};

export function PortalNotificationsClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/portal/notifications?pageSize=50", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setNotifications(json.data); })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          // Handle error silently
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  async function markRead(id: string) {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    try {
      const res = await fetchWithCsrf(`/api/v1/portal/notifications/${id}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to mark as read");
    } catch {
      // Revert on failure
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: null } : n)),
      );
    }
  }

  async function markAllRead() {
    const snapshot = notifications;
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    try {
      const res = await fetchWithCsrf("/api/v1/portal/notifications/read-all", { method: "POST" });
      if (!res.ok) throw new Error("Failed to mark all as read");
    } catch {
      setNotifications(snapshot); // Revert on failure
    }
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Notificações</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="text-xs font-semibold">
            Marcar todas
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200/50 p-8 text-center">
          <Bell className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Nenhuma notificação</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const Icon = TYPE_ICONS[notif.type] ?? Bell;
            const isUnread = !notif.readAt;
            return (
              <button
                key={notif.id}
                onClick={() => isUnread && markRead(notif.id)}
                className={cn(
                  "block w-full text-left bg-white rounded-2xl border p-4 transition-all hover:shadow-md active:bg-gray-50",
                  isUnread ? "border-blue-200 bg-blue-50/40" : "border-gray-200/50",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "mt-0.5 p-2 rounded-lg flex-shrink-0",
                    isUnread ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", isUnread ? "font-semibold text-gray-900" : "text-gray-700")}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.body}</p>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {format(new Date(notif.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  {isUnread && <div className="h-2.5 w-2.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
