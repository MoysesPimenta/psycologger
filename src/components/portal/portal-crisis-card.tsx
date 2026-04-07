"use client";

import { Heart, Phone } from "lucide-react";

interface PortalCrisisCardProps {
  phone?: string;
  text?: string;
}

export function PortalCrisisCard({
  phone = "188",
  text = "Você não está sozinho(a). Se precisar de apoio imediato, ligue para o CVV.",
}: PortalCrisisCardProps) {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100/30 border border-blue-200/50 rounded-2xl p-5 space-y-4" role="alert">
      <div className="flex items-start gap-3">
        <Heart className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-blue-900">
            Notamos que você pode estar passando por um momento difícil.
          </p>
          <p className="text-sm text-blue-800 mt-1">{text}</p>
        </div>
      </div>

      <div className="space-y-2 pl-9">
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-2.5 text-sm font-semibold text-blue-700 hover:text-blue-900 bg-white rounded-lg px-3 py-2.5 hover:bg-blue-50 transition-colors"
        >
          <Phone className="h-4 w-4" />
          CVV: {phone} (24h, gratuito)
        </a>
        <a
          href="tel:192"
          className="flex items-center gap-2.5 text-sm font-semibold text-blue-700 hover:text-blue-900 bg-white rounded-lg px-3 py-2.5 hover:bg-blue-50 transition-colors"
        >
          <Phone className="h-4 w-4" />
          SAMU: 192
        </a>
      </div>

      <p className="text-xs text-blue-600 font-medium mt-3 pl-9">
        Este aplicativo não substitui atendimento de emergência.
      </p>
    </div>
  );
}
