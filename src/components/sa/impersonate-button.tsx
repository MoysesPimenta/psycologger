/**
 * Impersonate button — used in /sa/users and /sa/tenants pages
 * Starts impersonation of the selected user
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export interface ImpersonateButtonProps {
  userId: string;
  userName: string;
}

export function ImpersonateButton({ userId, userName }: ImpersonateButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleImpersonate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/sa/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        // Redirect to /app/today
        router.push("/app/today");
        router.refresh();
      } else {
        const error = await res.json();
        alert(`Erro: ${error.error}`);
      }
    } catch (error) {
      console.error("Impersonation error:", error);
      alert("Erro ao impersonar usuário");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleImpersonate}
      disabled={isLoading}
      className="flex items-center gap-1.5 px-2 py-1 bg-yellow-900/30 hover:bg-yellow-900/50 disabled:opacity-50 text-yellow-400 text-xs font-medium rounded transition-colors"
      title={`Impersonar ${userName}`}
    >
      <LogIn className="h-3.5 w-3.5" />
      {isLoading ? "..." : "Impersonar"}
    </button>
  );
}
