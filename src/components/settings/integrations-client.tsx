"use client";

import { useState, useEffect } from "react";
import { ExternalLink, CheckCircle, XCircle, AlertCircle, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { NfseCredentialsForm } from "./nfse-credentials-form";

interface IntegrationStatus {
  type: string;
  status: string;
  providerName: string | null;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
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
    available: true,
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
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalCalendars, setGcalCalendars] = useState<GoogleCalendar[]>([]);
  const [gcalSelectedId, setGcalSelectedId] = useState<string | null>(null);
  const [gcalCalendarsLoading, setGcalCalendarsLoading] = useState(false);
  const [nfseShowForm, setNfseShowForm] = useState(false);

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

  // Load Google Calendar list when Google Calendar is connected
  useEffect(() => {
    const status = statuses["GOOGLE_CALENDAR"];
    if (status?.status === "ACTIVE") {
      loadGoogleCalendars();
    }
  }, [statuses["GOOGLE_CALENDAR"]?.status]);

  const loadGoogleCalendars = async () => {
    setGcalCalendarsLoading(true);
    try {
      const resp = await fetch("/api/v1/calendar/calendars");
      if (resp.ok) {
        const json = await resp.json();
        setGcalCalendars(json.data.calendars || []);
        setGcalSelectedId(json.data.selectedCalendarId || null);
      }
    } catch (err) {
      console.warn("[integrations] Failed to load Google Calendars:", err);
    } finally {
      setGcalCalendarsLoading(false);
    }
  };

  const handleGoogleCalendarConnect = async () => {
    setGcalLoading(true);
    try {
      const resp = await fetch("/api/v1/calendar/auth");
      if (resp.ok) {
        const json = await resp.json();
        window.location.href = json.data.authUrl;
      } else {
        setError("Erro ao iniciar conexão com Google Calendar");
      }
    } catch (err) {
      console.error("[integrations] Failed to get auth URL:", err);
      setError("Erro ao iniciar conexão com Google Calendar");
    } finally {
      setGcalLoading(false);
    }
  };

  const handleGoogleCalendarDisconnect = async () => {
    setGcalLoading(true);
    try {
      const resp = await fetchWithCsrf("/api/v1/calendar/disconnect", {
        method: "POST",
      });
      if (resp.ok) {
        setStatuses((prev) => ({
          ...prev,
          GOOGLE_CALENDAR: { ...prev.GOOGLE_CALENDAR, status: "INACTIVE" },
        }));
        setGcalCalendars([]);
        setGcalSelectedId(null);
      } else {
        setError("Erro ao desconectar Google Calendar");
      }
    } catch (err) {
      console.error("[integrations] Failed to disconnect:", err);
      setError("Erro ao desconectar Google Calendar");
    } finally {
      setGcalLoading(false);
    }
  };

  const handleGoogleCalendarSelect = async (calendarId: string) => {
    setGcalCalendarsLoading(true);
    try {
      const resp = await fetchWithCsrf("/api/v1/calendar/calendars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      if (resp.ok) {
        setGcalSelectedId(calendarId);
      } else {
        setError("Erro ao atualizar calendário selecionado");
      }
    } catch (err) {
      console.error("[integrations] Failed to select calendar:", err);
      setError("Erro ao atualizar calendário selecionado");
    } finally {
      setGcalCalendarsLoading(false);
    }
  };

  const handleNfseSaved = () => {
    setNfseShowForm(false);
    // Reload statuses
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
        console.warn("[integrations] Failed to reload integration statuses:", err);
      });
  };

  const handleNfseDisconnect = async () => {
    try {
      const resp = await fetchWithCsrf("/api/v1/nfse/credentials", {
        method: "DELETE",
      });
      if (resp.ok) {
        setStatuses((prev) => ({
          ...prev,
          NFSE: { type: "NFSE", status: "INACTIVE", providerName: null },
        }));
      } else {
        setError("Erro ao desconectar NFSe Nacional");
      }
    } catch (err) {
      console.error("[integrations] Failed to disconnect NFSE:", err);
      setError("Erro ao desconectar NFSe Nacional");
    }
  };

  if (nfseShowForm) {
    return (
      <NfseCredentialsForm
        onSaved={handleNfseSaved}
        onClose={() => setNfseShowForm(false)}
      />
    );
  }

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
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {integration.available ? (
                    currentStatus === "ACTIVE" ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/5"
                          disabled={gcalLoading}
                          onClick={
                            integration.type === "GOOGLE_CALENDAR"
                              ? handleGoogleCalendarDisconnect
                              : integration.type === "NFSE"
                              ? handleNfseDisconnect
                              : undefined
                          }
                        >
                          {gcalLoading && <Loader className="h-3 w-3 mr-1 animate-spin" />}
                          Desconectar
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        disabled={loading || gcalLoading}
                        onClick={
                          integration.type === "GOOGLE_CALENDAR"
                            ? handleGoogleCalendarConnect
                            : integration.type === "NFSE"
                            ? () => setNfseShowForm(true)
                            : undefined
                        }
                      >
                        {gcalLoading && <Loader className="h-3 w-3 mr-1 animate-spin" />}
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
                  <p className="text-xs text-red-600">
                    Ocorreu um erro na integração. Reconecte sua conta.
                  </p>
                )}

                {integration.type === "GOOGLE_CALENDAR" && currentStatus === "ACTIVE" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Calendário selecionado
                    </label>
                    {gcalCalendarsLoading ? (
                      <div className="text-xs text-gray-500">Carregando calendários...</div>
                    ) : gcalCalendars.length > 0 ? (
                      <Select value={gcalSelectedId || ""} onValueChange={handleGoogleCalendarSelect}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione um calendário" />
                        </SelectTrigger>
                        <SelectContent>
                          {gcalCalendars.map((cal) => (
                            <SelectItem key={cal.id} value={cal.id}>
                              {cal.summary}
                              {cal.primary && " (Principal)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Nenhum calendário disponível. Reconecte sua conta.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
