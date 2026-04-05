"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Portal session timeout warning.
 *
 * The backend expires portal sessions after 30 minutes of inactivity.
 * This component tracks user activity client-side and:
 *  - Shows a warning dialog at 25 minutes of inactivity
 *  - Automatically redirects to /portal/login at 30 minutes
 *
 * Any user interaction (click, keydown, scroll, touch) resets the timer.
 */

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — must match PORTAL_IDLE_TIMEOUT_MS
const WARNING_AT_MS = 25 * 60 * 1000;   // Show warning at 25 min
const TICK_INTERVAL_MS = 15_000;         // Check every 15 seconds

export function SessionTimeoutWarning() {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(300); // 5 min

  // Reset idle timer on user activity
  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
    }
  }, [showWarning]);

  // Listen for user activity events
  useEffect(() => {
    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    for (const event of events) {
      window.addEventListener(event, handleActivity, { passive: true });
    }
    return () => {
      for (const event of events) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [handleActivity]);

  // Periodic check
  useEffect(() => {
    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;

      if (idle >= IDLE_TIMEOUT_MS) {
        // Session expired — redirect to login
        clearInterval(interval);
        router.replace("/portal/login?reason=timeout");
        return;
      }

      if (idle >= WARNING_AT_MS) {
        const left = Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000));
        setRemainingSeconds(left);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router]);

  // Countdown every second once warning is visible
  useEffect(() => {
    if (!showWarning) return;

    const countdown = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      const left = Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000));
      setRemainingSeconds(left);

      if (left <= 0) {
        clearInterval(countdown);
        router.replace("/portal/login?reason=timeout");
      }
    }, 1000);

    return () => clearInterval(countdown);
  }, [showWarning, router]);

  if (!showWarning) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="timeout-title"
      aria-describedby="timeout-desc"
    >
      <div className="bg-white rounded-xl shadow-xl mx-4 p-6 max-w-sm w-full text-center">
        <h2 id="timeout-title" className="text-lg font-semibold text-gray-900 mb-2">
          Sua sessão vai expirar
        </h2>
        <p id="timeout-desc" className="text-sm text-gray-600 mb-4">
          Por segurança, sua sessão expira após inatividade. Clique abaixo ou interaja
          com a página para continuar conectado.
        </p>
        <p className="text-2xl font-mono font-bold text-brand-600 mb-5">
          {minutes}:{seconds.toString().padStart(2, "0")}
        </p>
        <button
          type="button"
          onClick={handleActivity}
          className="w-full py-2.5 px-4 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          Continuar conectado
        </button>
      </div>
    </div>
  );
}
