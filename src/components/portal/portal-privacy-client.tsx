"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Shield, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface ConsentRecord {
  id: string;
  consentType: string;
  version: string;
  acceptedAt: string;
  revokedAt: string | null;
}

const CONSENT_LABELS: Record<string, { title: string; desc: string }> = {
  TERMS_OF_USE: { title: "Termos de Uso", desc: "Aceite dos termos de uso do portal." },
  PRIVACY_POLICY: { title: "Política de Privacidade", desc: "Consentimento para coleta e uso dos dados." },
  DATA_SHARING: { title: "Compartilhamento de Dados", desc: "Compartilhamento de dados com a clínica." },
  JOURNAL_SHARING: { title: "Diário Compartilhado", desc: "Permite que entradas marcadas como 'compartilhado' sejam visíveis ao terapeuta." },
};

const CONSENT_VERSION = "2026-04-01";

export function PortalPrivacyClient() {
  const [records, setRecords] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/v1/portal/consents", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setRecords(json.data); })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          // Handle error silently
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  async function handleConsent(consentType: string, action: "accept" | "revoke") {
    try {
      const res = await fetchWithCsrf("/api/v1/portal/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentType, version: CONSENT_VERSION, action }),
      });
      if (!res.ok) {
        setError("Erro ao atualizar consentimento.");
        return;
      }
      // Refresh
      const refreshRes = await fetch("/api/v1/portal/consents");
      if (refreshRes.ok) {
        const json = await refreshRes.json();
        setRecords(json.data);
        setError(null);
      } else {
        setError("Erro ao atualizar consentimento.");
      }
    } catch {
      setError("Erro ao atualizar consentimento.");
    }
  }

  function isActive(type: string): boolean {
    return records.some((r) => r.consentType === type && !r.revokedAt);
  }

  return (
    <div className="space-y-4 pb-6">
      <h1 className="text-2xl font-bold text-gray-900">Privacidade e Consentimentos</h1>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 border border-red-200 mb-4">
          <p className="text-sm text-red-700 font-medium">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(CONSENT_LABELS).map(([type, { title, desc }]) => {
            const active = isActive(type);
            return (
              <div key={type} className="bg-white rounded-2xl border border-gray-200/50 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {active ? (
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <X className="h-5 w-5 text-gray-300 flex-shrink-0" />
                      )}
                      <p className="font-semibold text-sm text-gray-900">{title}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5 ml-7">{desc}</p>
                  </div>
                  <Button
                    variant={active ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleConsent(type, active ? "revoke" : "accept")}
                    className={active ? "" : "bg-blue-600 hover:bg-blue-700 text-white"}
                  >
                    {active ? "Revogar" : "Aceitar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
      {records.length > 0 && (
        <div className="mt-8 pt-6 border-t">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Histórico de consentimentos</p>
          <div className="space-y-2">
            {records.slice(0, 20).map((r) => (
              <p key={r.id} className="text-xs text-gray-600 bg-white rounded-lg p-2.5">
                <span className="font-medium">{CONSENT_LABELS[r.consentType]?.title ?? r.consentType}</span>
                <br />
                <span className="text-gray-500">
                  {r.revokedAt
                    ? `Revogado em ${format(new Date(r.revokedAt), "dd/MM/yyyy", { locale: ptBR })}`
                    : `Aceito em ${format(new Date(r.acceptedAt), "dd/MM/yyyy", { locale: ptBR })}`}
                  {" "}· v{r.version}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
