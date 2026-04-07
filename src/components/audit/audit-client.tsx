"use client";

import { useState, useEffect, useCallback } from "react";
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
  user: { name: string | null; email: string } | null;
}

export function AuditClient() {
  const { toast } = useToast();
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
        toast({ title: json?.error ?? "Erro ao exportar auditoria", variant: "destructive" });
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
      toast({ title: "Erro de rede ao exportar auditoria", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center sm:justify-between">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border rounded-md px-3 py-2 sm:py-1.5 text-sm bg-white h-11 sm:h-auto"
        >
          <option value="">Todas as ações</option>
          <option value="LOGIN">Login</option>
          <option value="PATIENT_CREATE">Paciente criado</option>
          <option value="SESSION_CREATE">Sessão criada</option>
          <option value="SESSION_UPDATE">Sessão atualizada</option>
          <option value="CHARGE_CREATE">Cobrança criada</option>
          <option value="PAYMENT_CREATE">Pagamento registrado</option>
          <option value="APPOINTMENT_CREATE">Consulta criada</option>
        </select>
        <Button variant="outline" size="sm" onClick={exportCsv} className="h-11 sm:h-auto w-full sm:w-auto gap-1.5">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar CSV</span>
          <span className="sm:hidden">Exportar</span>
        </Button>
      </div>

      {/* Desktop table view */}
      <div className="bg-white border rounded-xl overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 font-medium text-gray-500">Data/Hora</th>
                <th className="text-left p-3 font-medium text-gray-500">Usuário</th>
                <th className="text-left p-3 font-medium text-gray-500">Ação</th>
                <th className="text-left p-3 font-medium text-gray-500">Entidade</th>
                <th className="text-left p-3 font-medium text-gray-500">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="p-3">
                      <div className="animate-pulse h-4 bg-gray-100 rounded" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    <Shield className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-3 text-gray-600 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="p-3">
                      <p className="font-medium text-gray-900">{log.user?.name ?? "—"}</p>
                      <p className="text-xs text-gray-400">{log.user?.email}</p>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 text-xs">{log.entity} {log.entityId?.slice(0, 8)}</td>
                    <td className="p-3 text-gray-400 text-xs">{log.ipAddress ?? "—"}</td>
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
            <div key={i} className="bg-white rounded-lg border p-3 animate-pulse h-20" />
          ))
        ) : logs.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            <Shield className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Nenhum registro encontrado.</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="bg-white rounded-lg border p-3 min-h-[70px]">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{log.user?.name ?? "—"}</p>
                  <p className="text-xs text-gray-400 truncate">{log.user?.email}</p>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 flex-shrink-0 whitespace-nowrap">
                  {log.action}
                </span>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <p>{formatDateTime(log.createdAt)}</p>
                {log.entity && <p>{log.entity} {log.entityId?.slice(0, 8)}</p>}
                {log.ipAddress && <p className="text-gray-400">IP: {log.ipAddress}</p>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
