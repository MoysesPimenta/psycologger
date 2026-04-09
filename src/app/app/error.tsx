"use client";

/**
 * /app/* error boundary — staff/clinic app routes.
 * Shows user-friendly error message with reset button.
 */

import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("next_route_error", "App route error caught by error boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold mb-2">Erro na aplicação</h1>
      <p className="text-muted-foreground mb-6 max-w-md">
        Encontramos um problema inesperado. Tente novamente em instantes.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
      >
        Tentar novamente
      </button>
    </div>
  );
}
