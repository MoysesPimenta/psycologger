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
      const res = await fetch("/api/v1/onboarding", {
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
        setError(data?.error?.message ?? "Erro ao configurar clínica. Tente novamente.");
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
            <CardTitle>
              {userName ? `Bem-vindo, ${userName.split(" ")[0]}!` : "Bem-vindo!"}
            </CardTitle>
            <CardDescription>
              Quase pronto. Dê um nome para sua clínica ou consultório para começar.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Show the prefilled email as read-only context */}
              {userEmail && (
                <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-600">
                  Entrando como <span className="font-medium">{userEmail}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="clinicName">Nome da clínica / consultório</Label>
                <Input
                  id="clinicName"
                  placeholder="Clínica Ana Silva"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  required
                  autoFocus
                  minLength={2}
                  maxLength={100}
                />
                <p className="text-xs text-gray-500">
                  Você pode alterar isso nas configurações depois.
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
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
