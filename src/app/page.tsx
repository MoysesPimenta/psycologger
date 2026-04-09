import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ClipboardList,
  DollarSign,
  Lock,
  CheckCircle2,
  Stethoscope,
  ArrowRight,
  Shield,
} from "lucide-react";

const features = [
  {
    icon: Calendar,
    title: "Agenda Inteligente",
    description:
      "Gerencie consultas com detecção de conflitos, lembretes automáticos por email e visão semanal/mensal.",
  },
  {
    icon: ClipboardList,
    title: "Prontuário Eletrônico",
    description:
      "Registre evoluções com templates SOAP, controle de versões e acesso restrito por permissão.",
  },
  {
    icon: DollarSign,
    title: "Gestão Financeira",
    description:
      "Controle cobranças, pagamentos (Pix, cartão, convênio), relatórios e exportação CSV.",
  },
  {
    icon: Lock,
    title: "Segurança e Privacidade",
    description:
      "Dados isolados por clínica, log de auditoria completo, criptografia e conformidade LGPD.",
  },
  {
    icon: Shield,
    title: "Multi-tenancy",
    description:
      "Suporte a múltiplas clínicas e equipes, com controle de acesso por papel (admin, psicólogo, assistente).",
  },
  {
    icon: CheckCircle2,
    title: "Fluxo Diário Rápido",
    description:
      'Tela "Hoje" otimizada: inicie sessão, registre nota e marque pagamento em menos de 1 minuto.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg">Psycologger</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
            <Link href="/docs" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Documentação
            </Link>
            <Link href="/pricing" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Planos
            </Link>
            <Link href="/login" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Entrar
            </Link>
            <Button asChild size="sm">
              <Link href="/signup">Criar conta grátis</Link>
            </Button>
          </nav>
          <div className="flex md:hidden gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Criar conta</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 px-3 py-1 rounded-full text-sm font-medium mb-6 border border-transparent dark:border-brand-800">
          <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
          Beta disponível — acesso gratuito
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold leading-tight mb-6">
          Gestão clínica para
          <br />
          <span className="text-brand-600 dark:text-brand-400">psicólogos modernos</span>
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto mb-10">
          Prontuário eletrônico, agenda e financeiro integrados. Simplifique sua
          prática clínica e dedique mais tempo aos seus pacientes.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="text-base">
            <Link href="/signup">
              Começar grátis <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="text-base">
            <Link href="/pricing">Ver planos</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 dark:bg-gray-900 py-20 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-center mb-4">
            Tudo que você precisa em um só lugar
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-12 max-w-xl mx-auto">
            Desenvolvido com psicólogos brasileiros para atender às exigências
            do CFP e da LGPD.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20 transition-shadow"
                >
                  <div className="w-10 h-10 bg-brand-100 dark:bg-brand-900/50 rounded-lg flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-brand-700 dark:bg-brand-800 text-white text-center transition-colors">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-bold mb-4">
            Pronto para simplificar sua clínica?
          </h2>
          <p className="text-brand-200 dark:text-brand-300 mb-8">
            Crie sua conta em menos de 2 minutos. Sem cartão de crédito.
          </p>
          <Button asChild size="lg" variant="secondary" className="text-base">
            <Link href="/signup">
              Criar conta grátis <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span>© 2026 Psycologger. Todos os direitos reservados.</span>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors">Privacidade</Link>
            <Link href="/terms" className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors">Termos</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
