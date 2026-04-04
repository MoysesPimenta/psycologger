"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function PortalActivateClient({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"activating" | "success" | "error">("activating");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function activate() {
      try {
        const res = await fetch("/api/v1/portal/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "activate", token }),
        });

        if (cancelled) return;

        if (res.ok) {
          setStatus("success");
          setTimeout(() => {
            if (!cancelled) {
              router.push("/portal/dashboard");
              router.refresh();
            }
          }, 1500);
        } else {
          const data = await res.json().catch(() => null);
          setErrorMsg(data?.error?.message ?? "Token inválido ou expirado.");
          setStatus("error");
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Erro de conexão. Tente novamente.");
          setStatus("error");
        }
      }
    }

    activate();
    return () => { cancelled = true; };
  }, [token, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {status === "activating" && (
          <>
            <Loader2 className="h-10 w-10 text-brand-500 animate-spin mx-auto" />
            <h1 className="text-xl font-bold text-gray-900">Ativando sua conta...</h1>
            <p className="text-sm text-gray-500">Aguarde um momento.</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
            <h1 className="text-xl font-bold text-gray-900">Conta ativada!</h1>
            <p className="text-sm text-gray-500">Redirecionando para o portal...</p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
            <h1 className="text-xl font-bold text-gray-900">Não foi possível ativar</h1>
            <p className="text-sm text-gray-500">{errorMsg}</p>
            <div className="space-y-2">
              <Link
                href="/portal/login"
                className="inline-block px-6 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
              >
                Ir para o login
              </Link>
              <p className="text-xs text-gray-400">
                Se o link expirou, peça um novo convite ao seu terapeuta.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
