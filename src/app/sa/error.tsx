"use client";

/**
 * /sa/* error boundary.
 *
 * SA is an internal ops surface so we surface the real error message + digest
 * (unlike the public-facing root boundary). This is intentional — operators
 * need actionable debugging info when something blows up under `/sa/*`.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";

export default function SAError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("sa");

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[sa_route_error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center text-white">
      <h1 className="text-2xl font-semibold mb-2 text-red-300">{t("error.title")}</h1>
      <p className="text-gray-400 mb-4 max-w-xl font-mono text-xs whitespace-pre-wrap">
        {error?.message || String(error)}
      </p>
      {error?.digest && (
        <p className="text-gray-600 mb-4 text-xs">
          {t("error.digest")} {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="px-4 py-2 rounded-md bg-brand-600 text-white font-medium hover:bg-brand-700"
      >
        {t("error.tryAgain")}
      </button>
    </div>
  );
}
