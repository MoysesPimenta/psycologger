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
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3" role="alert">
      <div className="flex items-center gap-2">
        <Heart className="h-5 w-5 text-blue-500" />
        <p className="font-semibold text-blue-900">
          Notamos que você pode estar passando por um momento difícil.
        </p>
      </div>

      <p className="text-sm text-blue-800">{text}</p>

      <div className="space-y-2">
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          <Phone className="h-4 w-4" />
          CVV: {phone} (24h, gratuito)
        </a>
        <a
          href="tel:192"
          className="flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          <Phone className="h-4 w-4" />
          SAMU: 192
        </a>
      </div>

      <p className="text-xs text-blue-500 mt-2">
        Este aplicativo não substitui atendimento de emergência.
      </p>
    </div>
  );
}
