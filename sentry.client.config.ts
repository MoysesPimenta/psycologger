import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    // Scrub obvious PHI from breadcrumbs
    beforeBreadcrumb(breadcrumb: Sentry.Breadcrumb | null) {
      if (breadcrumb && breadcrumb.category === "console" && typeof breadcrumb.message === "string") {
        // Drop any breadcrumb containing CPF-shaped digits
        if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(breadcrumb.message)) return null;
      }
      return breadcrumb;
    },
  });
}
