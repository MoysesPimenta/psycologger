"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TrendData {
  date: string;
  displayDate?: string;
  moodScore?: number;
  anxietyScore?: number;
  energyScore?: number;
  sleepScore?: number;
}

interface TrendResponse {
  data: TrendData[];
}

interface JournalTrendChartProps {
  patientId: string;
}

export default function JournalTrendChart({
  patientId,
}: JournalTrendChartProps) {
  const [days, setDays] = useState<number | null>(7);
  const [data, setData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrendData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = new URL("/api/v1/journal-inbox/trends", window.location.origin);
      url.searchParams.append("patientId", patientId);
      if (days !== null) {
        url.searchParams.append("days", days.toString());
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error("Failed to fetch trend data");
      }

      const json: TrendResponse = await response.json();
      const formattedData = json.data.map((item) => ({
        ...item,
        displayDate: format(parseISO(item.date), "dd/MM", { locale: ptBR }),
      }));
      setData(formattedData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar dados de tendência"
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [patientId, days]);

  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  const chartData = data.map((item) => ({
    date: item.displayDate,
    moodScore: item.moodScore,
    anxietyScore: item.anxietyScore,
    energyScore: item.energyScore,
    sleepScore: item.sleepScore,
  }));

  return (
    <div className="w-full bg-white border border-gray-200 rounded-xl p-5">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Tendência de Humor
        </h2>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setDays(7)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              days === 7
                ? "bg-indigo-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            7d
          </button>
          <button
            onClick={() => setDays(30)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              days === 30
                ? "bg-indigo-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            30d
          </button>
          <button
            onClick={() => setDays(90)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              days === 90
                ? "bg-indigo-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            90d
          </button>
          <button
            onClick={() => setDays(null)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              days === null
                ? "bg-indigo-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-500 text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="w-full h-80 bg-gray-200 rounded-lg animate-pulse" />
      ) : chartData.length === 0 ? (
        <div className="w-full h-80 flex items-center justify-center bg-gray-50 rounded-lg">
          <p className="text-gray-500">Nenhum dado de humor encontrado no período.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              stroke="#9ca3af"
              style={{ fontSize: "0.875rem" }}
            />
            <YAxis
              domain={[0, 10]}
              stroke="#9ca3af"
              style={{ fontSize: "0.875rem" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "0.5rem",
                padding: "0.75rem",
              }}
              labelStyle={{ color: "#1f2937" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) =>
                typeof value === "number" ? value.toFixed(1) : "—"
              }
              labelFormatter={(label) => `Data: ${label}`}
            />
            <Legend
              wrapperStyle={{ paddingTop: "1rem" }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="moodScore"
              stroke="#6366f1"
              name="Humor"
              dot={false}
              connectNulls
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="anxietyScore"
              stroke="#ef4444"
              name="Ansiedade"
              dot={false}
              connectNulls
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="energyScore"
              stroke="#22c55e"
              name="Energia"
              dot={false}
              connectNulls
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="sleepScore"
              stroke="#3b82f6"
              name="Sono"
              dot={false}
              connectNulls
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
