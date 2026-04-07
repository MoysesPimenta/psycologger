"use client";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Cannot use logger here — root-level error may have broken module loading.
    // Use raw console as last resort.
    // eslint-disable-next-line no-console
    console.error("[global-error]", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>Erro crítico</h1>
          <p style={{ color: "#666", marginBottom: "1.5rem", maxWidth: "28rem" }}>
            Não foi possível carregar a aplicação. Por favor, recarregue a página.
          </p>
          <button onClick={reset} style={{ padding: "0.5rem 1rem", borderRadius: "0.375rem", background: "#2563eb", color: "white", border: "none", fontWeight: 500, cursor: "pointer" }}>
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
