import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV || "development",
    // Do not send request bodies — may contain PHI
    sendDefaultPii: false,
    beforeSend(event: Sentry.Event) {
      // Strip request data that might carry PHI
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
          delete event.request.headers["x-csrf-token"];
        }
      }
      return event;
    },
    ignoreErrors: [
      // Known noise
      "NEXT_NOT_FOUND",
      "NEXT_REDIRECT",
    ],
  });
}
