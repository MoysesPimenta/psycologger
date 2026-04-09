"use client";

/**
 * Polls /sa/support every N seconds via router.refresh() so newly arrived
 * inbound emails appear without a manual reload. Pauses while the tab is
 * hidden to avoid burning queries on backgrounded windows.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SupportAutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    start();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, intervalMs]);
  return null;
}
