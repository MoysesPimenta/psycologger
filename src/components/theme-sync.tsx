"use client";

import { useEffect } from "react";

/**
 * Cross-device theme sync. Server layouts pass the DB-stored preference
 * for the logged-in staff/patient; if the local cookie disagrees we
 * adopt the server value, write a fresh cookie, and re-apply the class.
 *
 * Anonymous toggling (no DB row) is unaffected because no <ThemeSync />
 * is mounted on public pages.
 */
export function ThemeSync({ serverTheme }: { serverTheme: "light" | "dark" | "system" }) {
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )psy-theme=([^;]+)/);
    const cookieTheme = m?.[1];
    if (cookieTheme === serverTheme) return;

    document.cookie = `psy-theme=${serverTheme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;

    const root = document.documentElement;
    const effective =
      serverTheme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : serverTheme;
    root.classList.toggle("dark", effective === "dark");
    root.style.colorScheme = effective;
  }, [serverTheme]);

  return null;
}
