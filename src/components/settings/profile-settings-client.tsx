"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { User, Mail, Phone, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface Props {
  initialName: string;
  email: string;
  initialPhone: string;
}

export function ProfileSettingsClient({ initialName, email, initialPhone }: Props) {
  const { update: updateSession } = useSession();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const dirty = name !== initialName || phone !== initialPhone;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      setError("Nome deve ter ao menos 2 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Erro ao salvar.");
        return;
      }

      // Update the NextAuth session so the name shows everywhere immediately
      await updateSession({ name: name.trim() });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados pessoais</CardTitle>
          <CardDescription>
            Seu nome é exibido nos relatórios, fichas de pacientes e notificações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="flex items-center gap-1.5 text-sm font-medium">
              <User className="h-3.5 w-3.5 text-gray-400" />
              Nome completo
            </Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dra. Ana Silva"
              required
              minLength={2}
              maxLength={100}
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Mail className="h-3.5 w-3.5 text-gray-400" />
              Email
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={email}
                readOnly
                disabled
                className="bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-gray-400">
              O email é usado para autenticação e não pode ser alterado aqui.
              Entre em contato com o suporte se precisar trocá-lo.
            </p>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone" className="flex items-center gap-1.5 text-sm font-medium">
              <Phone className="h-3.5 w-3.5 text-gray-400" />
              Telefone / WhatsApp
              <span className="text-xs font-normal text-gray-400">(opcional)</span>
            </Label>
            <Input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-9999"
              maxLength={30}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            {saved ? (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Perfil salvo com sucesso
              </span>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={saving || !dirty || !name.trim()} className="min-w-[120px]">
              {saving ? (
                "Salvando..."
              ) : (
                <span className="flex items-center gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Salvar alterações
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
