"use client";

import { useState, useEffect } from "react";
import { ExternalLink, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface IntegrationStatus {
  type: string;
  status: string;
  providerName: string | null;
}

const INTEGRATIONS = [
  {
    type: "GOOGLE_CALENDAR",
    label: "Google Calendar",
    description:
      "Sincronize as consultas automaticamente com o Google Calendar dos profissionais.",
    logo: "🗓️",
    docsUrl: "https://docs.psycologger.com/integrations/google-calendar",
    available: true,
  },
  {
    type: "NFSE",
    label: "NFSe (Nota Fiscal de Serviço)",
    description:
      "Emita notas fiscais automaticamente ao marcar uma cobrança como paga.",
    logo: "🧾",
    docsUrl: "https://docs.psycologger.com/integrations/nfse",
    available: false, // coming soon
  },
];

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE")
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
        <CheckCircle className="h-3 w-3" /> Conectado
      </Badge>
    );
  if (status === "ERROR")
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
        <XCircle className="h-3 w-3" /> Erro
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-gray-500 gap-1">
      <AlertCircle className="h-3 w-3" /> Não conectado
    </Badge>
  );
}

export function IntegrationsClient() {
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch current integration statuses
    fetch("/api/v1/integrations")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          const map: Record<string, IntegrationStatus> = {};
          for (const item of json.data) map[item.type] = item;
          setStatuses(map);
        }
      })
      .catch((err) => {
        console.warn("[integrations] Failed to load integration statuses:", err);
        setError("Erro ao carregar status das integrações.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {INTEGRATIONS.map((integration) => {
        const status = statuses[integration.type];
        const currentStatus = status?.status ?? "INACTIVE";

        return (
          <Card key={integration.type}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{integration.logo}</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {integration.label}
                      {!integration.available && (
                        <Badge variant="outline" className="text-xs font-normal">
                          Em breve
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {integration.description}
                    </CardDescription>
                  </div>
                </div>
                <StatusBadge status={integration.available ? currentStatus : "INACTIVE"} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {integration.available ? (
                  currentStatus === "ACTIVE" ? (
                    <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5">
                      Desconectar
                    </Button>
                  ) : (
                    <Button size="sm" disabled={loading}>
                      Conectar
                    </Button>
                  )
                ) : (
                  <Button size="sm" disabled variant="outline">
                    Em breve
                  </Button>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Documentação
                  </a>
                </Button>
              </div>
              {currentStatus === "ERROR" && status && (
                <p className="text-xs text-red-600 mt-2">
                  Ocorreu um erro na integração. Reconecte sua conta.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
