"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AlertCircle, Mail } from "lucide-react";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/csrf-client";

export function PortalLoginClient() {
  const t = useTranslations("portalLogin");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetchWithCsrf("/api/v1/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "magic-link-request",
          email: email.toLowerCase().trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? t("sendError"));
        return;
      }

      setSent(true);
    } catch {
      setError(t("connectionError"));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <Mail className="h-12 w-12 text-brand-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900">{t("checkEmail")}</h1>
          <p className="text-sm text-gray-500">
            {t("linkSentMessage", { email })}
            <br />
            {t("linkExpiration")}
          </p>
          <p className="text-xs text-gray-400">
            {t("multiClinic")}
          </p>
          <button
            onClick={() => { setSent(false); setError(null); }}
            className="text-sm text-brand-600 hover:underline"
          >
            {t("useAnotherEmail")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t("portalTitle")}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t("enterEmail")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg flex items-start gap-2" role="alert">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="seu@email.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("sending") : t("sendLink")}
          </Button>
        </form>

        <div className="text-center">
          <p className="text-xs text-gray-400">
            Recebeu um convite?{" "}
            <Link href="/portal/activate" className="text-brand-600 hover:underline">
              Ative sua conta
            </Link>
          </p>
        </div>

        <p className="text-center text-[10px] text-gray-300 mt-8">
          Este aplicativo não substitui atendimento de emergência.
          <br />
          Em caso de crise, ligue 188 (CVV) ou 192 (SAMU).
        </p>
      </div>
    </div>
  );
}
