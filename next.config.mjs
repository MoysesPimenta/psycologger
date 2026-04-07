import { withSentryConfig } from "@sentry/nextjs";

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
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Static CSP — nonce-based CSP rejected (see docs/decisions/csp-nonce-parked.md)
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://*.sentry.io https://va.vercel-scripts.com https://vitals.vercel-insights.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.sentry.io https://*.supabase.co https://api.resend.com https://api.stripe.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
              "frame-src 'self' https://js.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
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
