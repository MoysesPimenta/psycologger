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
        <div className="animate-spin w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 md:flex md:items-center md:justify-center px-4 py-6">
      {/* Header with logo */}
      <div className="text-center mb-8 md:mb-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center">
            <Stethoscope className="h-6 w-6 text-white" />
          </div>
          <span className="font-bold text-2xl text-gray-900">Psycologger</span>
        </Link>
      </div>

      {/* Main content */}
      <div className="w-full max-w-sm md:max-w-sm">
        {error ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="h-7 w-7 text-red-600" />
              </div>
              <p className="text-gray-900 font-semibold text-lg">{error}</p>
              <Button asChild className="mt-6 w-full h-12 text-base rounded-xl font-semibold" variant="outline">
                <Link href="/signup">Criar nova conta</Link>
              </Button>
            </CardContent>
          </Card>
        ) : accepted ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <p className="font-semibold text-gray-900 text-lg">Conta ativada!</p>
              <p className="text-gray-600 mt-3 text-sm">
                Enviamos um link de acesso para <strong>{invite?.email}</strong>. Verifique seu email.
              </p>
            </CardContent>
          </Card>
        ) : invite ? (
          <Card>
            <CardHeader className="pt-8 pb-6">
              <CardTitle className="text-3xl font-bold mb-2">Aceitar convite</CardTitle>
              <CardDescription className="text-base">
                Você foi convidado para ingressar em <strong>{invite.tenant.name}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-8">
              <form onSubmit={handleAccept} className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-base font-medium">Email</Label>
                  <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-medium">{invite.email}</div>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="name" className="text-base font-medium">Seu nome completo</Label>
                  <Input
                    id="name"
                    placeholder="Dra. Ana Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                    className="min-h-12 text-base rounded-xl"
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-base rounded-xl font-semibold" loading={accepting} disabled={!name.trim()}>
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
