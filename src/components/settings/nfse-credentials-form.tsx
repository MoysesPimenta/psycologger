"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface CredentialsFormProps {
  onSaved?: () => void;
  onClose?: () => void;
}

export function NfseCredentialsForm({ onSaved, onClose }: CredentialsFormProps) {
  const [certificatePfxBase64, setCertificatePfxBase64] = useState("");
  const [certificateFileName, setCertificateFileName] = useState<string | null>(null);
  const [certificatePassword, setCertificatePassword] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState("");
  const [codigoMunicipio, setCodigoMunicipio] = useState("");
  const [codigoTributacaoNacional, setCodigoTributacaoNacional] = useState("6319");
  const [ambiente, setAmbiente] = useState<"producao" | "homologacao">("homologacao");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");
      setCertificatePfxBase64(base64);
      setCertificateFileName(file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!certificatePfxBase64) {
        throw new Error("Certificado digital é obrigatório");
      }

      const res = await fetchWithCsrf("/api/v1/nfse/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificatePfxBase64,
          certificatePassword,
          cnpj: cnpj.replace(/\D/g, ""),
          inscricaoMunicipal,
          codigoMunicipio,
          codigoTributacaoNacional,
          ambiente,
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
        <CardTitle>Configurar NFSe Nacional</CardTitle>
        <CardDescription>
          Adicione suas credenciais da API NFSe Nacional (certificado digital) para emitir notas fiscais automaticamente.
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
            <Label htmlFor="certificate">Certificado Digital (PFX/A1) *</Label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                id="certificate"
                type="file"
                accept=".pfx,.p12"
                onChange={handleFileUpload}
                required
                disabled={loading}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full justify-start"
              >
                <Upload className="h-4 w-4 mr-2" />
                {certificateFileName || "Selecionar arquivo PFX"}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Arquivo PFX/A1 da sua e-CNPJ. Será criptografado e armazenado com segurança.
            </p>
          </div>

          <div>
            <Label htmlFor="certificatePassword">Senha do Certificado *</Label>
            <Input
              id="certificatePassword"
              type="password"
              placeholder="Sua senha de proteção do certificado"
              value={certificatePassword}
              onChange={(e) => setCertificatePassword(e.target.value)}
              required
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Senha será criptografada e armazenada com segurança.
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

          <div>
            <Label htmlFor="codigoTributacaoNacional">Código Tributação Nacional</Label>
            <Input
              id="codigoTributacaoNacional"
              placeholder="Ex: 6319"
              value={codigoTributacaoNacional}
              onChange={(e) => setCodigoTributacaoNacional(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Padrão: 6319 (CNAE 8650-0/01 - Psicologia). Altere se necessário.
            </p>
          </div>

          <div>
            <Label htmlFor="ambiente">Ambiente *</Label>
            <select
              id="ambiente"
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value as "producao" | "homologacao")}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="homologacao">Homologação (Testes)</option>
              <option value="producao">Produção</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Use Homologação para testes e Produção para emissão real.
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading || !certificatePfxBase64}>
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
