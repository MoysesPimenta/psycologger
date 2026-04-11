"use client";

import { useState, useEffect, useRef } from "react";
import { UserPlus, Mail, Shield, Copy, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { roleLabel, formatRelative } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { fetchWithCsrf } from "@/lib/csrf-client";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    fetch("/api/v1/users")
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar membros.");
        return r.json();
      })
      .then((d) => {
        setMembers(d.data ?? []);
        setLoadError(null);
      })
      .catch((err) => { setLoadError(err.message ?? "Erro ao carregar membros."); })
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await fetchWithCsrf("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        const errorMsg = typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? "Erro ao enviar convite";
        throw new Error(errorMsg);
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
      <div className="bg-card rounded-xl border p-6">
        <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
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
            className="border rounded-md px-3 py-2 text-sm bg-card"
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
                  <code className="flex-1 min-w-0 text-xs bg-card border border-amber-200 rounded px-3 py-2 text-foreground truncate block">
                    {inviteLink}
                  </code>
                  <button
                    onClick={copyLink}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-md transition-colors"
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

      {/* Error display */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Members list */}
      <div className="bg-card rounded-xl border">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-foreground">Membros da equipe</h2>
        </div>
        <div className="divide-y">
          {loadError ? (
            <div className="p-4 text-sm text-red-600">{loadError}</div>
          ) : loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 animate-pulse h-16 bg-muted/50" />
            ))
          ) : members.map((m) => (
            <div key={m.id} className="flex items-center gap-4 p-4">
              <div className="w-9 h-9 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
                {(m.user.name ?? m.user.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{m.user.name ?? m.user.email}</p>
                <p className="text-sm text-muted-foreground">{m.user.email}</p>
                {m.user.lastLoginAt && (
                  <p className="text-xs text-muted-foreground/70">Último acesso: {formatRelative(m.user.lastLoginAt)}</p>
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
