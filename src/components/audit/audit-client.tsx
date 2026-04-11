"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Download, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AuditEntry {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: string;
  ipAddress: string | null;
  user: { name: string | null; email: string | null } | null;
}

interface AuditClientProps {
  canExport?: boolean;
}

export function AuditClient({ canExport = false }: AuditClientProps) {
  const { toast } = useToast();
  const t = useTranslations("audit");
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "50", ...(filter && { action: filter }) });
    const res = await fetch(`/api/v1/audit?${params}`);
    if (res.ok) {
      const json = await res.json();
      setLogs(json.data);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  async function exportCsv() {
    try {
      const res = await fetch("/api/v1/audit?export=true");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast({ title: json?.error ?? t("exportCSV"), variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "auditoria.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("exportCSV"), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center sm:justify-between">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border rounded-md px-3 py-2 sm:py-1.5 text-sm bg-card dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 h-11 sm:h-auto"
        >
          <option value="">{t("filterAllActions")}</option>
          <option value="LOGIN">{t("filterLogin")}</option>
          <option value="PATIENT_CREATE">{t("filterPatientCreate")}</option>
          <option value="SESSION_CREATE">{t("filterSessionCreate")}</option>
          <option value="SESSION_UPDATE">{t("filterSessionUpdate")}</option>
          <option value="CHARGE_CREATE">{t("filterChargeCreate")}</option>
          <option value="PAYMENT_CREATE">{t("filterPaymentCreate")}</option>
          <option value="APPOINTMENT_CREATE">{t("filterAppointmentCreate")}</option>
        </select>
        {canExport && (
          <Button variant="outline" size="sm" onClick={exportCsv} className="h-11 sm:h-auto w-full sm:w-auto gap-1.5">
            <Download className="h-4 w-4" />
            <span>{t("exportCSV")}</span>
          </Button>
        )}
      </div>

      {/* Desktop table view */}
      <div className="bg-card dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700 bg-muted/50 dark:bg-gray-900">
                <th className="text-left p-3 font-medium text-muted-foreground dark:text-gray-400">{t("tableHeaderDateTime")}</th>
                <th className="text-left p-3 font-medium text-muted-foreground dark:text-gray-400">{t("tableHeaderUser")}</th>
                <th className="text-left p-3 font-medium text-muted-foreground dark:text-gray-400">{t("tableHeaderAction")}</th>
                <th className="text-left p-3 font-medium text-muted-foreground dark:text-gray-400">{t("tableHeaderEntity")}</th>
                {canExport && (
                  <th className="text-left p-3 font-medium text-muted-foreground dark:text-gray-400">{t("tableHeaderIP")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={canExport ? 5 : 4} className="p-3">
                      <div className="animate-pulse h-4 bg-muted dark:bg-gray-700 rounded" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={canExport ? 5 : 4} className="p-8 text-center text-muted-foreground dark:text-gray-400">
                    <Shield className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40 dark:text-gray-600" />
                    {t("emptyState")}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted dark:hover:bg-gray-700/50">
                    <td className="p-3 text-muted-foreground dark:text-gray-300 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="p-3">
                      <p className="font-medium text-foreground dark:text-gray-100">{log.user?.name ?? "—"}</p>
                      {log.user?.email && (
                        <p className="text-xs text-muted-foreground/70">{log.user.email}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted dark:bg-gray-700 text-foreground dark:text-gray-300">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground dark:text-gray-400 text-xs">{log.entity} {log.entityId?.slice(0, 8)}</td>
                    {canExport && (
                      <td className="p-3 text-muted-foreground/70 text-xs">{log.ipAddress ?? "—"}</td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-3 animate-pulse h-20" />
          ))
        ) : logs.length === 0 ? (
          <div className="bg-card dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-8 text-center text-muted-foreground dark:text-gray-400">
            <Shield className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40 dark:text-gray-600" />
            <p className="text-sm">{t("emptyState")}</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="bg-card dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-3 min-h-[70px]">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground dark:text-gray-100 truncate">{log.user?.name ?? "—"}</p>
                  {log.user?.email && (
                    <p className="text-xs text-muted-foreground/70 truncate">{log.user.email}</p>
                  )}
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted dark:bg-gray-700 text-foreground dark:text-gray-300 flex-shrink-0 whitespace-nowrap">
                  {log.action}
                </span>
              </div>
              <div className="text-xs text-muted-foreground dark:text-gray-400 space-y-0.5">
                <p>{formatDateTime(log.createdAt)}</p>
                {log.entity && <p>{log.entity} {log.entityId?.slice(0, 8)}</p>}
                {canExport && log.ipAddress && <p className="text-muted-foreground/70">IP: {log.ipAddress}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
