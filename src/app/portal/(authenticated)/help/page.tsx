import { Heart, Phone, ExternalLink } from "lucide-react";

export const metadata = { title: "Ajuda — Portal do Paciente" };

export default function PortalHelpPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Ajuda e Recursos</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-blue-500" />
          <p className="font-semibold text-blue-900">Recursos de Apoio</p>
        </div>

        <div className="space-y-3">
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

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <p className="font-medium text-gray-900 text-sm">Sobre este portal</p>
        <p className="text-sm text-gray-500">
          O Portal do Paciente é uma ferramenta de apoio ao seu acompanhamento terapêutico.
          Aqui você pode ver suas sessões agendadas, acompanhar pagamentos, e manter um
          diário de humor e reflexões.
        </p>
        <p className="text-sm text-gray-500">
          Suas anotações marcadas como &quot;privado&quot; só são visíveis para você.
          Anotações &quot;compartilhadas&quot; podem ser lidas pelo seu terapeuta.
        </p>
      </div>

      <p className="text-xs text-gray-300 text-center">
        Este aplicativo não substitui atendimento de emergência.
        Em caso de crise, ligue 188 (CVV) ou 192 (SAMU).
      </p>
    </div>
  );
}
