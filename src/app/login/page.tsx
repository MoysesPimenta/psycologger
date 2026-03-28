"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Stethoscope, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const verify = searchParams.get("verify");
  const authError = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn("email", {
        email: email.toLowerCase().trim(),
        redirect: false,
        callbackUrl: "/app/today",
      });
      if (result?.error) {
        setError("Não foi possível enviar o link. Tente novamente.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Ocorreu um erro. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (verify || sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="h-6 w-6 text-brand-600" />
            </div>
            <CardTitle>Verifique seu email</CardTitle>
            <CardDescription>
              Enviamos um link de acesso para <strong>{email || "seu email"}</strong>.
              Clique no link para entrar.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-gray-500 mb-4">
              Não recebeu o email? Verifique a pasta de spam ou tente novamente.
            </p>
            <Button
              variant="outline"
              onClick={() => { setSent(false); }}
              className="w-full"
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-900">Psycologger</span>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Entrar na sua conta</CardTitle>
            <CardDescription>
              Informe seu email para receber o link de acesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              {(error || authError) && (
                <p className="text-sm text-destructive">
                  {error || "Erro de autenticação. Tente novamente."}
                </p>
              )}

              <Button type="submit" className="w-full" loading={loading}>
                <Mail className="mr-2 h-4 w-4" />
                {loading ? "Enviando..." : "Enviar link de acesso"}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-gray-500">
              Não tem conta?{" "}
              <Link href="/signup" className="text-brand-600 hover:underline font-medium">
                Criar conta grátis
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400">
          Ao entrar, você concorda com nossos{" "}
          <Link href="/terms" className="hover:underline">Termos de Uso</Link> e{" "}
          <Link href="/privacy" className="hover:underline">Política de Privacidade</Link>.
        </p>
      </div>
    </div>
  );
}
