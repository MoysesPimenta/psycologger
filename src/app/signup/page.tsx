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
            <CardTitle className="text-3xl font-bold mb-2">Criar conta grátis</CardTitle>
            <CardDescription className="text-base">
              {step === "account"
                ? "Seus dados pessoais"
                : "Informações da sua clínica"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-8">
            {/* Step indicator */}
            <div className="flex gap-2 mb-8">
              {["account", "clinic"].map((s, i) => (
                <div key={s} className="flex-1 flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      step === s || (s === "account" && step === "clinic")
                        ? "bg-brand-600 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className="text-xs text-gray-600 font-medium hidden sm:block">
                    {s === "account" ? "Conta" : "Clínica"}
                  </span>
                  {i < 1 && <div className="flex-1 h-1 bg-gray-200 rounded-full" />}
                </div>
              ))}
            </div>

            {step === "account" ? (
              <form onSubmit={handleAccountStep} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="name" className="text-base font-medium">Nome completo</Label>
                  <Input
                    id="name"
                    placeholder="Dra. Ana Silva"
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    required
                    autoFocus
                    className="min-h-12 text-base rounded-xl"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="email" className="text-base font-medium">Email profissional</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ana@clinica.com.br"
                    value={form.email}
                    onChange={(e) => updateForm("email", e.target.value)}
                    required
                    className="min-h-12 text-base rounded-xl"
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-base rounded-xl font-semibold">
                  Continuar
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="clinicName" className="text-base font-medium">Nome da clínica / consultório</Label>
                  <Input
                    id="clinicName"
                    placeholder="Clínica Ana Silva"
                    value={form.clinicName}
                    onChange={(e) => updateForm("clinicName", e.target.value)}
                    required
                    autoFocus
                    className="min-h-12 text-base rounded-xl"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Você pode alterar isso nas configurações depois.
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("account")}
                    className="flex-1 h-12 text-base rounded-xl font-semibold"
                  >
                    Voltar
                  </Button>
                  <Button type="submit" className="flex-1 h-12 text-base rounded-xl font-semibold" loading={loading}>
                    {loading ? "Criando..." : "Criar conta"}
                  </Button>
                </div>
              </form>
            )}

            <div className="mt-6 text-center text-sm text-gray-600">
              Já tem conta?{" "}
              <Link href="/login" className="text-brand-600 font-semibold hover:underline">
                Entrar
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
