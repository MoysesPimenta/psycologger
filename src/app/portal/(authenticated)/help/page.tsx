"use client";

import { useState, useEffect } from "react";
import { Heart, Phone, HelpCircle, Shield, BookOpen } from "lucide-react";

interface HelpData {
  safetyText: string | null;
  crisisPhone: string | null;
  journalEnabled: boolean;
  paymentsVisible: boolean;
}

export default function PortalHelpPage() {
  const [data, setData] = useState<HelpData | null>(null);

  useEffect(() => {
    fetch("/api/v1/portal/dashboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.data) {
          setData({
            safetyText: json.data.portalFlags?.safetyText ?? null,
            crisisPhone: json.data.portalFlags?.crisisPhone ?? null,
            journalEnabled: json.data.portalFlags?.journalEnabled ?? true,
            paymentsVisible: json.data.portalFlags?.paymentsVisible ?? true,
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Ajuda e Recursos</h1>

      {/* Crisis resources */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-blue-500" />
          <p className="font-semibold text-blue-900">Recursos de Apoio</p>
        </div>

        {data?.safetyText && (
          <p className="text-sm text-blue-800">{data.safetyText}</p>
        )}

        <div className="space-y-3">
          {data?.crisisPhone && (
            <a
              href={`tel:${data.crisisPhone}`}
              className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
            >
              <Phone className="h-4 w-4" />
              Clínica — {data.crisisPhone}
            </a>
          )}
          <a
            href="tel:188"
            className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            <Phone className="h-4 w-4" />
            CVV — 188 (24h, gratuito)
          </a>
          <a
            href="tel:192"
            className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            <Phone className="h-4 w-4" />
            SAMU — 192
          </a>
        </div>
      </div>

      {/* About the portal */}
      <div className="bg-white rounded-xl border p-4 space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-gray-400" />
          <p className="font-medium text-gray-900 text-sm">Sobre este portal</p>
        </div>
        <p className="text-sm text-gray-500">
          O Portal do Paciente é uma ferramenta de apoio ao seu acompanhamento terapêutico.
          Aqui você pode ver suas sessões agendadas
          {data?.paymentsVisible !== false && ", acompanhar pagamentos"}
          {data?.journalEnabled !== false && ", e manter um diário de humor e reflexões"}.
        </p>
      </div>

      {/* FAQ sections */}
      <div className="bg-white rounded-xl border divide-y">
        <details className="group p-4">
          <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-900">
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-gray-400" />
              O que é o diário?
            </span>
            <span className="text-gray-400 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <p className="text-sm text-gray-500 mt-3">
            O diário permite que você registre seu humor, reflexões e eventos importantes
            entre as sessões. Anotações marcadas como &quot;privado&quot; só são visíveis para você.
            Anotações &quot;compartilhadas&quot; podem ser lidas pelo seu terapeuta para apoiar
            o acompanhamento terapêutico.
          </p>
        </details>

        <details className="group p-4">
          <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-900">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-gray-400" />
              Meus dados estão seguros?
            </span>
            <span className="text-gray-400 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <p className="text-sm text-gray-500 mt-3">
            Sim. Seus dados são criptografados e armazenados de acordo com as melhores práticas
            de segurança da informação. As anotações do diário são criptografadas antes de serem
            armazenadas. Você pode gerenciar seus consentimentos na página de Privacidade no seu
            perfil.
          </p>
        </details>

        <details className="group p-4">
          <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-gray-900">
            <span className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              Como acessar minha sessão online?
            </span>
            <span className="text-gray-400 group-open:rotate-180 transition-transform">&#9662;</span>
          </summary>
          <p className="text-sm text-gray-500 mt-3">
            Para sessões online, o link de acesso à sala virtual ficará disponível na página
            de detalhes da sessão quando estiver próximo do horário agendado. Verifique sua
            conexão de internet e tenha um ambiente tranquilo antes de entrar.
          </p>
        </details>
      </div>

      <p className="text-xs text-gray-300 text-center">
        Este aplicativo não substitui atendimento de emergência.
        Em caso de crise, ligue 188 (CVV) ou 192 (SAMU).
      </p>
    </div>
  );
}
