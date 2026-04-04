"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { Stethoscope, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [invite, setInvite] = useState<{ email: string; role: string; tenant: { name: string; slug: string } } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/invites/${params.token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setError(data.error?.message ?? "Convite inválido ou expirado.");
        } else {
          const data = await res.json();
          setInvite(data.data);
        }
      })
      .catch(() => setError("Erro ao verificar convite."))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setAccepting(true);
    try {
      const res = await fetchWithCsrf(`/api/v1/invites/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      setAccepted(true);
      // Send magic link to new user
      await signIn("email", {
        email: invite!.email,
        redirect: false,
        callbackUrl: "/app/today",
      });
    } catch {
      setError("Erro ao aceitar convite.");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">Psycologger</span>
          </Link>
        </div>

        {error ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <p className="text-gray-700 font-medium">{error}</p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/signup">Criar nova conta</Link>
              </Button>
            </CardContent>
          </Card>
        ) : accepted ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <p className="font-semibold text-gray-900">Conta ativada!</p>
              <p className="text-gray-500 mt-2">
                Enviamos um link de acesso para <strong>{invite?.email}</strong>. Verifique seu email.
              </p>
            </CardContent>
          </Card>
        ) : invite ? (
          <Card>
            <CardHeader>
              <CardTitle>Aceitar convite</CardTitle>
              <CardDescription>
                Você foi convidado para ingressar em <strong>{invite.tenant.name}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAccept} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <p className="text-sm text-gray-700 bg-gray-50 border rounded-md px-3 py-2">{invite.email}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Seu nome completo</Label>
                  <Input
                    id="name"
                    placeholder="Dra. Ana Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" loading={accepting} disabled={!name.trim()}>
                  {accepting ? "Ativando conta..." : "Aceitar convite"}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
