"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Download, BarChart3 } from "lucide-react";

interface ReportData {
  period: { year: number; month: number };
  summary: {
    totalCharged: number;
    totalReceived: number;
    totalPending: number;
    completedAppointments: number;
    chargesCount: number;
  };
  byProvider: { name: string; received: number; sessions: number }[];
}

const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function ReportsClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadReport() {
    setLoading(true);
    const res = await fetch(`/api/v1/reports?type=monthly&year=${year}&month=${month}`);
    if (res.ok) {
      const json = await res.json();
      setData(json.data);
    }
    setLoading(false);
  }

  useEffect(() => { loadReport(); }, [year, month]);

  async function exportCsv() {
    const res = await fetch(`/api/v1/reports?type=monthly&year=${year}&month=${month}&export=true`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3 bg-white border rounded-xl p-4">
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border rounded-md px-3 py-2 text-sm"
        >
          {months.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded-md px-3 py-2 text-sm"
        >
          {[2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <Button onClick={exportCsv} variant="outline" size="sm">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-5 animate-pulse h-24" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Cobrado</p>
              <p className="text-xl font-bold">{formatCurrency(data.summary.totalCharged)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Recebido</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(data.summary.totalReceived)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Pendente</p>
              <p className="text-xl font-bold text-yellow-600">{formatCurrency(data.summary.totalPending)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Consultas realizadas</p>
              <p className="text-xl font-bold">{data.summary.completedAppointments}</p>
            </div>
          </div>

          {/* By provider */}
          {data.byProvider.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-brand-600" />
                Receita por profissional
              </h3>
              <div className="space-y-3">
                {data.byProvider.map((p) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.sessions} sessões</p>
                    </div>
                    <p className="font-bold text-green-600">{formatCurrency(p.received)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
