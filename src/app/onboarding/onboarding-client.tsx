"use client";

/**
 * OnboardingClient — shown to authenticated users who have no clinic membership yet.
 *
 * This happens when:
 *  1. A brand-new user clicked "login" (not signup) and NextAuth created a bare user
 *     record, then redirected them here via pages.newUser = "/onboarding".
 *  2. An invited user accepted the magic link but there's some edge-case where their
 *     membership wasn't created yet.
 *
 * The user is ALREADY authenticated (session exists). We just need them to name their
 * clinic and then we create the tenant + membership on the server.
 *
 * We NEVER redirect to /signup — that would be confusing and lose the session.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/csrf-client";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  userName: string;
  userEmail: string;
}

export function OnboardingClient({ userName, userEmail }: Props) {
  const router = useRouter();
  const [clinicName, setClinicName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicName.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetchWithCsrf("/api/v1/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Fall back to the email username part if the session has no name
          // (happens when the user logged in via magic link without signing up first)
          name: userName || userEmail.split("@")[0],
          email: userEmail,
          clinicName: clinicName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? "Erro ao configurar clínica. Tente novamente.");
        return;
      }

      // Tenant + membership created — go to the app.
      // Use router.replace so the user can't go "back" to onboarding.
      router.replace("/app/today");
    } catch {
      setError("Ocorreu um erro de rede. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
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
        <Card>
          <CardHeader className="pt-8 pb-6">
            <CardTitle className="text-3xl font-bold mb-2">
              {userName ? `Bem-vindo, ${userName.split(" ")[0]}!` : "Bem-vindo!"}
            </CardTitle>
            <CardDescription className="text-base">
              Quase pronto. Dê um nome para sua clínica ou consultório para começar.
            </CardDescription>
          </CardHeader>

          <CardContent className="pb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Show the prefilled email as read-only context */}
              {userEmail && (
                <div className="rounded-lg bg-brand-50 border border-brand-200 px-4 py-3 text-sm text-brand-700">
                  <span className="text-xs text-brand-600 font-medium">Entrando como</span>
                  <p className="font-semibold text-brand-900">{userEmail}</p>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="clinicName" className="text-base font-medium">Nome da clínica / consultório</Label>
                <Input
                  id="clinicName"
                  placeholder="Clínica Ana Silva"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  required
                  autoFocus
                  minLength={2}
                  maxLength={100}
                  className="min-h-12 text-base rounded-xl"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Você pode alterar isso nas configurações depois.
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base rounded-xl font-semibold"
                disabled={loading || !clinicName.trim()}
              >
                {loading ? "Configurando..." : "Entrar no Psycologger"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
