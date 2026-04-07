"use client";
import { useEffect } from "react";
import { logger } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("next_route_error", "Route error caught by error boundary", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold mb-2">Algo deu errado</h1>
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
