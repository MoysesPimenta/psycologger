"use client";

import { useState, useEffect } from "react";
import { UserPlus, Mail, Shield, Copy, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { roleLabel, formatRelative } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Member {
  id: string;
  role: string;
  status: string;
  user: { id: string; name: string | null; email: string; lastLoginAt: string | null };
}

const roles = [
  { value: "PSYCHOLOGIST", label: "Psicólogo(a)" },
  { value: "TENANT_ADMIN", label: "Administrador" },
  { value: "ASSISTANT", label: "Assistente" },
  { value: "READONLY", label: "Leitor" },
];

export function UsersSettingsClient() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("PSYCHOLOGIST");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    fetch("/api/v1/users")
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar membros.");
        return r.json();
      })
      .then((d) => { setMembers(d.data ?? []); })
      .catch((err) => { setLoadError(err.message ?? "Erro ao carregar membros."); })
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message);
      }
      const result = await res.json();
      if (result.data?.emailSent === false) {
        // Email failed but invite was created — show the link for manual sharing
        setInviteLink(result.data.inviteUrl);
        setCopied(false);
        toast({ title: "Convite criado! Copie o link abaixo para compartilhar.", variant: "default" });
      } else {
        setInviteLink(null);
        toast({ title: `Convite enviado para ${inviteEmail}`, variant: "success" });
      }
      setInviteEmail("");
    } catch (err: any) {
      toast({ title: err.message ?? "Erro ao enviar convite", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-brand-600" />
          Convidar novo membro
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
          </div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-white"
          >
            {roles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <Button type="submit" loading={inviting}>
            <Mail className="h-4 w-4" />
            Enviar convite
          </Button>
        </form>

        {/* Invite link banner (shown when email delivery fails) */}
        {inviteLink && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Link2 className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-900">
                  O email não pôde ser enviado. Compartilhe o link manualmente:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 min-w-0 text-xs bg-white border border-amber-200 rounded px-3 py-2 text-gray-700 truncate block">
                    {inviteLink}
                  </code>
                  <button
                    onClick={copyLink}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-md transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar link
                      </>
                    )}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setInviteLink(null)}
                className="text-amber-400 hover:text-amber-600 text-lg leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Members list */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-900">Membros da equipe</h2>
        </div>
        <div className="divide-y">
          {loadError ? (
            <div className="p-4 text-sm text-red-600">{loadError}</div>
          ) : loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 animate-pulse h-16 bg-gray-50" />
            ))
          ) : members.map((m) => (
            <div key={m.id} className="flex items-center gap-4 p-4">
              <div className="w-9 h-9 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-sm font-bold">
                {(m.user.name ?? m.user.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{m.user.name ?? m.user.email}</p>
                <p className="text-sm text-gray-500">{m.user.email}</p>
                {m.user.lastLoginAt && (
                  <p className="text-xs text-gray-400">Último acesso: {formatRelative(m.user.lastLoginAt)}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{roleLabel(m.role)}</Badge>
                <Badge variant={m.status === "ACTIVE" ? "success" : "secondary"} className="text-xs">
                  {m.status === "ACTIVE" ? "Ativo" : "Convidado"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
