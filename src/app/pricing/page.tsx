import Link from "next/link";
import { CheckCircle2, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Gratuito",
    priceBRL: "R$ 0",
    priceUSD: null,
    period: "/mês",
    description: "Para psicólogos que querem experimentar",
    highlight: false,
    features: [
      "1 psicólogo",
      "Até 3 pacientes ativos",
      "Agenda e prontuário",
      "Financeiro básico",
      "Lembretes por email",
      "Suporte via email",
    ],
    cta: "Começar grátis",
    href: "/signup",
  },
  {
    name: "Pro",
    priceBRL: "R$ 99",
    priceUSD: "US$ 20",
    period: "/mês",
    description: "Para profissionais em plena atividade",
    highlight: true,
    features: [
      "1 psicólogo",
      "Até 25 pacientes ativos",
      "Agenda + prontuário completo",
      "Financeiro + relatórios",
      "NFSe automática",
      "Google Calendar",
      "Suporte prioritário",
    ],
    cta: "Assinar agora",
    href: "/signup?plan=pro",
  },
  {
    name: "Clínica",
    priceBRL: "R$ 199",
    priceUSD: "US$ 40",
    period: "/mês",
    description: "Para clínicas com múltiplos profissionais",
    highlight: false,
    features: [
      "Até 5 psicólogos",
      "Pacientes ilimitados",
      "Tudo do Pro",
      "Multi-usuário + papéis",
      "Agenda compartilhada",
      "Exportação de dados",
      "SLA de suporte",
    ],
    cta: "Assinar agora",
    href: "/signup?plan=clinic",
  },
];

export const metadata = { title: "Planos e Preços" };

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold">Psycologger</span>
          </Link>
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Entrar</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900">Planos simples e transparentes</h1>
          <p className="text-gray-600 mt-3 text-lg">Sem taxas escondidas. Cancele quando quiser.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-8 flex flex-col ${
                plan.highlight
                  ? "border-brand-500 shadow-xl ring-2 ring-brand-500"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <div className="text-xs font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full w-fit mb-4">
                  MAIS POPULAR
                </div>
              )}
              <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
              <p className="text-gray-500 text-sm mt-1">{plan.description}</p>
              <div className="mt-6 mb-8">
                <span className="text-4xl font-bold text-gray-900">{plan.priceBRL}</span>
                <span className="text-gray-500">{plan.period}</span>
                {plan.priceUSD && (
                  <p className="text-sm text-gray-400 mt-1">ou {plan.priceUSD}{plan.period}</p>
                )}
              </div>

              <ul className="space-y-3 flex-1 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button asChild variant={plan.highlight ? "default" : "outline"} className="w-full">
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-400 mt-10">
          Dúvidas? <a href="mailto:suporte@psycologger.com" className="hover:underline">suporte@psycologger.com</a>
        </p>
      </div>
    </div>
  );
}
