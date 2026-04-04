import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Psycologger — Gestão para Psicólogos",
    template: "%s | Psycologger",
  },
  description:
    "Prontuário eletrônico, agenda e financeiro para psicólogos. Simplifique sua prática clínica.",
  keywords: ["psicólogo", "prontuário eletrônico", "agenda", "gestão clínica"],
  authors: [{ name: "Psycologger" }],
  creator: "Psycologger",
  metadataBase: new URL(
    process.env.NEXTAUTH_URL ?? "https://psycologger.com"
  ),
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "https://psycologger.com",
    title: "Psycologger — Gestão para Psicólogos",
    description: "Prontuário eletrônico, agenda e financeiro para psicólogos.",
    siteName: "Psycologger",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
