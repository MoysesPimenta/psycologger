import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { cookies, headers } from "next/headers";

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
  manifest: "/manifest.webmanifest",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  // Read the CSP nonce from the response header set by middleware.
  // The nonce is generated per-request and enables strict CSP while
  // still allowing Next.js inline hydration scripts.
  const nonce = headers().get("x-csp-nonce") || "";

  // Per-user theme preference is mirrored to a long-lived cookie by
  // POST /api/v1/me/theme. Reading it here lets us SSR the correct
  // class on <html> and avoid a flash of the wrong theme.
  const themeCookie = cookies().get("psy-theme")?.value;
  const theme: "light" | "dark" | "system" =
    themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";
  // For "system" we let the no-flash inline script below resolve it
  // against prefers-color-scheme; for explicit values we set the class
  // straight away.
  const htmlClass = theme === "dark" ? "dark" : "";

  return (
    <html lang="pt-BR" className={htmlClass} suppressHydrationWarning>
      <head>
        {/* No-flash theme bootstrap. Runs before paint, resolves
            "system" against the OS preference. Mirrors logic in
            <ThemeToggle />. The nonce attribute allows this inline
            script to bypass strict CSP. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )psy-theme=([^;]+)/);var t=m?m[1]:'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
