import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

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
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Psycologger",
  },
  icons: {
    apple: "/icons/apple-touch-icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#3b82f6",
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
      </body>
    </html>
  );
}
