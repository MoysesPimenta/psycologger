"use client";

import { useState } from "react";
import { fetchWithCsrf } from "@/lib/csrf-client";

type Tier = "PRO" | "CLINIC";
type Currency = "BRL" | "USD";

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      const res = await fetchWithCsrf("/api/v1/billing/portal", { method: "POST" });
      let data: { url?: string; error?: { message?: string } } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON body */
      }
      if (res.ok && data?.url) {
        window.location.href = data.url;
      } else {
        const msg =
          data?.error?.message ||
          `Erro ao abrir portal de assinatura (HTTP ${res.status})`;
        alert(msg);
        console.error("[billing] portal failed", res.status, data);
      }
    } finally {
      setLoading(false);
    }
  }
  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
    >
      {loading ? "Abrindo..." : "Gerenciar Assinatura"}
    </button>
  );
}

export function UpgradeButton({
  tier,
  currency = "BRL",
  label,
  color = "blue",
}: {
  tier: Tier;
  currency?: Currency;
  label: string;
  color?: "blue" | "emerald";
}) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      const res = await fetchWithCsrf("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, currency }),
      });
      let data: { url?: string; error?: { message?: string } } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON body */
      }
      if (res.ok && data?.url) {
        window.location.href = data.url;
      } else {
        const msg =
          data?.error?.message ||
          `Erro ao iniciar checkout (HTTP ${res.status})`;
        alert(msg);
        console.error("[billing] checkout failed", res.status, data);
      }
    } finally {
      setLoading(false);
    }
  }
  const bg = color === "emerald" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700";
  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      className={`w-full px-4 py-2 ${bg} text-white rounded-lg transition disabled:opacity-50`}
    >
      {loading ? "Redirecionando..." : label}
    </button>
  );
}
