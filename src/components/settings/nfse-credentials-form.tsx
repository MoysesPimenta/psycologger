"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface CredentialsFormProps {
  onSaved?: () => void;
  onClose?: () => void;
}

export function NfseCredentialsForm({ onSaved, onClose }: CredentialsFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState("");
  const [codigoMunicipio, setCodigoMunicipio] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetchWithCsrf("/api/v1/nfse/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          cnpj: cnpj.replace(/\D/g, ""),
          inscricaoMunicipal,
          codigoMunicipio,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || "Erro ao salvar credenciais");
      }

      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurar PlugNotas</CardTitle>
        <CardDescription>
          Adicione suas credenciais do PlugNotas para emitir notas fiscais automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex gap-2 rounded-md bg-red-50 p-3">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <Label htmlFor="apiKey">Chave da API PlugNotas *</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk_live_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Sua chave de API será criptografada e armazenada com segurança.
            </p>
          </div>

          <div>
            <Label htmlFor="cnpj">CNPJ *</Label>
            <Input
              id="cnpj"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              required
              disabled={loading}
              maxLength={18}
            />
          </div>

          <div>
            <Label htmlFor="inscricaoMunicipal">Inscrição Municipal *</Label>
            <Input
              id="inscricaoMunicipal"
              placeholder="Ex: 123456"
              value={inscricaoMunicipal}
              onChange={(e) => setInscricaoMunicipal(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="codigoMunicipio">Código do Município (IBGE) *</Label>
            <Input
              id="codigoMunicipio"
              placeholder="Ex: 3550308"
              value={codigoMunicipio}
              onChange={(e) => setCodigoMunicipio(e.target.value)}
              required
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Código IBGE do seu município. Encontre em{" "}
              <a
                href="https://www.ibge.gov.br/explica/codigos-dos-municipios.php"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                ibge.gov.br
              </a>
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Credenciais
            </Button>
            {onClose && (
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
