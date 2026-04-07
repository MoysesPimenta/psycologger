"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Stethoscope, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function LoginContent() {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pt-8">
            <div className="w-14 h-14 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="h-7 w-7 text-brand-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Verifique seu email</CardTitle>
            <CardDescription className="text-base mt-2">
              Enviamos um link de acesso para <strong>{email || "seu email"}</strong>.
              Clique no link para entrar.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <p className="text-sm text-gray-500 mb-6 text-center">
              Não recebeu o email? Verifique a pasta de spam ou tente novamente.
            </p>
            <Button
              variant="outline"
              onClick={() => { setSent(false); }}
              className="w-full h-12 text-base rounded-xl"
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
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

      {/* Main content — full width on mobile, centered card on desktop */}
      <div className="w-full max-w-sm md:max-w-sm flex flex-col">
        <Card className="flex-1 md:flex-none">
          <CardHeader className="pt-8 pb-6">
            <CardTitle className="text-3xl font-bold mb-2">Entrar</CardTitle>
            <CardDescription className="text-base">
              Informe seu email para receber o link de acesso.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="email" className="text-base font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  className="min-h-12 text-base rounded-xl"
                />
              </div>

              {(error || authError) && (
                <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error || "Erro de autenticação. Tente novamente."}
                </p>
              )}

              <Button type="submit" className="w-full h-12 text-base rounded-xl font-semibold" loading={loading}>
                <Mail className="mr-2 h-5 w-5" />
                {loading ? "Enviando..." : "Enviar link de acesso"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              Não tem conta?{" "}
              <Link href="/signup" className="text-brand-600 font-semibold hover:underline">
                Criar conta grátis
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Ao entrar, você concorda com nossos{" "}
          <Link href="/terms" className="hover:underline">Termos de Uso</Link> e{" "}
          <Link href="/privacy" className="hover:underline">Política de Privacidade</Link>.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
