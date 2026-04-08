/**
 * Impersonation banner — shown at top of /app/* when user is impersonating another user
 * Displays who is being impersonated and provides a "Stop" button.
 */

"use client";

import { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";

export interface ImpersonationBannerProps {
  impersonatedUserName?: string;
  impersonatedUserEmail?: string;
}

export default function ImpersonationBanner({
  impersonatedUserName,
  impersonatedUserEmail,
}: ImpersonationBannerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleStop = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/sa/impersonate/stop", {
        method: "POST",
      });
      if (res.ok) {
        router.push("/sa/dashboard");
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to stop impersonation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-900/90 text-white px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-sm">
            Impersonando {impersonatedUserName || impersonatedUserEmail || "usuário"}
          </p>
          {impersonatedUserEmail && (
            <p className="text-xs opacity-90">{impersonatedUserEmail}</p>
          )}
        </div>
      </div>
      <button
        onClick={handleStop}
        disabled={isLoading}
        className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 rounded text-xs font-medium transition-colors"
      >
        {isLoading ? (
          <>
            <div className="animate-spin h-3 w-3 border-1 border-white border-t-transparent rounded-full" />
            Parando...
          </>
        ) : (
          <>
            <X className="h-3.5 w-3.5" />
            Parar
          </>
        )}
      </button>
    </div>
  );
}
