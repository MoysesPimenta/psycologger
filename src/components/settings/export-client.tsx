"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText, Users, Calendar, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface ExportOption {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  endpoint: string;
  filename: string;
}

export function ExportClient() {
  const t = useTranslations("settings");

  const EXPORTS: ExportOption[] = [
    {
      key: "patients",
      label: t("exportPatients"),
      description: t("exportPatientsDesc"),
      icon: Users,
      endpoint: "/api/v1/reports?type=patients",
      filename: "pacientes.csv",
    },
    {
      key: "appointments",
      label: t("exportAppointments"),
      description: t("exportAppointmentsDesc"),
      icon: Calendar,
      endpoint: "/api/v1/reports?type=appointments",
      filename: "consultas.csv",
    },
    {
      key: "charges",
      label: t("exportCharges"),
      description: t("exportChargesDesc"),
      icon: CreditCard,
      endpoint: "/api/v1/reports?type=charges",
      filename: "cobrancas.csv",
    },
  ];
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleDownload(option: ExportOption) {
    setDownloading(option.key);
    setError("");
    try {
      const res = await fetch(option.endpoint);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? t("exportError"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = option.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("exportNetworkError"));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-4 pb-3">
          <p className="text-sm text-amber-900">
            <strong>{t("exportWarning")}</strong> {t("exportWarningMessage")}
          </p>
        </CardContent>
      </Card>

      {EXPORTS.map((option) => {
        const Icon = option.icon;
        const isDownloading = downloading === option.key;

        return (
          <Card key={option.key}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{option.label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{option.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(option)}
                disabled={isDownloading || downloading !== null}
              >
                <Download className="h-4 w-4 mr-1.5" />
                {isDownloading ? t("downloading") : t("exportButton")}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4 text-center">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {t("exportMoreData")}{" "}
            <a href="mailto:suporte@psycologger.com" className="text-brand-600 hover:underline">
              {t("exportContact")}
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
