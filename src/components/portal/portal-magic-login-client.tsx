"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { fetchWithCsrf } from "@/lib/csrf-client";

export function PortalMagicLoginClient({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      try {
        const res = await fetchWithCsrf("/api/v1/portal/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "magic-link-verify", token }),
        });

        if (cancelled) return;

        if (res.ok) {
          setStatus("success");
          // Redirect to dashboard after brief success message
          setTimeout(() => {
            if (!cancelled) {
              router.push("/portal/dashboard");
              router.refresh();
            }
          }, 1000);
        } else {
          const data = await res.json().catch(() => null);
          setErrorMsg(data?.error?.message ?? "Link inválido ou expirado.");
          setStatus("error");
        }
      } catch {
        if (!cancelled) {
          setErrorMsg("Erro de conexão. Tente novamente.");
          setStatus("error");
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, [token, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {status === "verifying" && (
          <>
            <Loader2 className="h-10 w-10 text-brand-500 animate-spin mx-auto" />
            <p className="text-gray-600">Verificando seu link de acesso...</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
            <p className="text-gray-900 font-medium">Acesso confirmado!</p>
            <p className="text-sm text-gray-500">Redirecionando...</p>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
            <p className="text-gray-900 font-medium">{errorMsg}</p>
            <Link
              href="/portal/login"
              className="inline-block px-6 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              Ir para o login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
