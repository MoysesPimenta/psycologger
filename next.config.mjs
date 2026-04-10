import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "@prisma/client",
      "prisma",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tgkgcapoykcazkimiwzw.supabase.co",
      },
    ],
  },
  // Note: Security headers (including CSP with nonce) are now set per-request in
  // src/middleware.ts. Each request gets a unique nonce for inline scripts,
  // which is safer than static 'unsafe-inline' directives.
};

export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  // Do NOT upload sourcemaps unless SENTRY_AUTH_TOKEN is set
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
});
