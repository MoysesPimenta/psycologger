"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"account" | "clinic">("account");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    clinicName: "",
  });

  function updateForm(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleAccountStep(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setStep("clinic");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clinicName) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithCsrf("/api/v1/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data?.error === "string" ? data.error : data?.error?.message ?? data?.message ?? "Erro ao criar conta.");
        return;
      }

      // Auto-login via magic link
      await signIn("email", {
        email: form.email.toLowerCase().trim(),
        redirect: false,
        callbackUrl: "/app/today",
      });

      router.push("/login?verify=1");
    } catch {
      setError("Ocorreu um erro. Tente novamente.");
    } finally {
      setLoading(false);
    }
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

        <Card>
          <CardHeader>
            <CardTitle>Criar conta grátis</CardTitle>
            <CardDescription>
              {step === "account"
                ? "Seus dados pessoais"
                : "Informações da sua clínica"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step indicator */}
            <div className="flex gap-2 mb-6">
              {["account", "clinic"].map((s, i) => (
                <div key={s} className="flex-1 flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      step === s || (s === "account" && step === "clinic")
                        ? "bg-brand-600 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className="text-xs text-gray-500 hidden sm:block">
                    {s === "account" ? "Conta" : "Clínica"}
                  </span>
                  {i < 1 && <div className="flex-1 h-0.5 bg-gray-200" />}
                </div>
              ))}
            </div>

            {step === "account" ? (
              <form onSubmit={handleAccountStep} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input
                    id="name"
                    placeholder="Dra. Ana Silva"
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email profissional</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ana@clinica.com.br"
                    value={form.email}
                    onChange={(e) => updateForm("email", e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Continuar
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clinicName">Nome da clínica / consultório</Label>
                  <Input
                    id="clinicName"
                    placeholder="Clínica Ana Silva"
                    value={form.clinicName}
                    onChange={(e) => updateForm("clinicName", e.target.value)}
                    required
                    autoFocus
                  />
                  <p className="text-xs text-gray-500">
                    Você pode alterar isso nas configurações depois.
                  </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("account")}
                    className="flex-1"
                  >
                    Voltar
                  </Button>
                  <Button type="submit" className="flex-1" loading={loading}>
                    {loading ? "Criando..." : "Criar conta"}
                  </Button>
                </div>
              </form>
            )}

            <div className="mt-4 text-center text-sm text-gray-500">
              Já tem conta?{" "}
              <Link href="/login" className="text-brand-600 hover:underline font-medium">
                Entrar
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
