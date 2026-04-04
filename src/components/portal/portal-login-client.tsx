"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PortalLoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email: email.toLowerCase().trim(),
          password,
          tenantId: tenantId.trim(),
        }),
      });

      if (!res.ok) {
        let errorMessage = "Erro ao fazer login.";
        try {
          const data = await res.json();
          errorMessage = data.error?.message ?? errorMessage;
        } catch {
          // Response body is not JSON, use default error
        }
        setError(errorMessage);
        return;
      }

      router.push("/portal/dashboard");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email || !tenantId) {
      setError("Preencha o email e código da clínica.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/v1/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "magic-link-request",
          email: email.toLowerCase().trim(),
          tenantId: tenantId.trim(),
        }),
      });
      if (res.ok) {
        setMagicLinkSent(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Erro ao enviar link.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Portal do Paciente</h1>
          <p className="mt-2 text-sm text-gray-500">
            Acesse sua área para ver sessões, pagamentos e seu diário.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="tenantId" className="block text-sm font-medium text-gray-700 mb-1">
              Código da clínica
            </label>
            <input
              id="tenantId"
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              required
              placeholder="Fornecido pela sua clínica"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-slate-50 text-gray-400">ou</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={loading || magicLinkSent}
            className="w-full px-4 py-2 text-sm font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50"
          >
            {magicLinkSent ? "Link enviado! Verifique seu email" : "Entrar com link mágico"}
          </button>
        </form>

        <div className="text-center space-y-2">
          <p className="text-xs text-gray-400">
            <Link href="/portal/forgot-password" className="text-brand-600 hover:underline">
              Esqueceu sua senha?
            </Link>
          </p>
          <p className="text-xs text-gray-400">
            Recebeu um convite?{" "}
            <Link href="/portal/activate" className="text-brand-600 hover:underline">
              Ative sua conta
            </Link>
          </p>
        </div>

        <p className="text-center text-[10px] text-gray-300 mt-8">
          Este aplicativo não substitui atendimento de emergência.
          <br />
          Em caso de crise, ligue 188 (CVV) ou 192 (SAMU).
        </p>
      </div>
    </div>
  );
}
