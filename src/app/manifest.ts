import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Psycologger — Portal do Paciente",
    short_name: "Psycologger",
    description:
      "Portal do paciente para acompanhar sessões, pagamentos e diário emocional.",
    start_url: "/portal/dashboard",
    scope: "/portal/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#3b82f6",
    background_color: "#ffffff",
    lang: "pt-BR",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
