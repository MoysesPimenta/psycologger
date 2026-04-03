"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Shield, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    await fetch("/api/v1/portal/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentType, version: CONSENT_VERSION, action }),
    });
    // Refresh
    const res = await fetch("/api/v1/portal/consents");
    if (res.ok) {
      const json = await res.json();
      setRecords(json.data);
    }
  }

  function isActive(type: string): boolean {
    return records.some((r) => r.consentType === type && !r.revokedAt);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Privacidade e Consentimentos</h1>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(CONSENT_LABELS).map(([type, { title, desc }]) => {
            const active = isActive(type);
            return (
              <div key={type} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {active ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-gray-300" />
                      )}
                      <p className="font-medium text-sm text-gray-900">{title}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 ml-6">{desc}</p>
                  </div>
                  <Button
                    variant={active ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleConsent(type, active ? "revoke" : "accept")}
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
        <div className="mt-6">
          <p className="text-xs font-medium text-gray-400 uppercase mb-3">Histórico</p>
          <div className="space-y-1">
            {records.slice(0, 20).map((r) => (
              <p key={r.id} className="text-xs text-gray-400">
                {CONSENT_LABELS[r.consentType]?.title ?? r.consentType} ·{" "}
                {r.revokedAt
                  ? `Revogado em ${format(new Date(r.revokedAt), "dd/MM/yyyy", { locale: ptBR })}`
                  : `Aceito em ${format(new Date(r.acceptedAt), "dd/MM/yyyy", { locale: ptBR })}`}
                {" "}· v{r.version}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
