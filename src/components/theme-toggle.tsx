"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "psy-theme";

function readCookie(): Theme {
  if (typeof document === "undefined") return "system";
  const m = document.cookie.match(/(?:^|; )psy-theme=([^;]+)/);
  const v = m?.[1];
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const effective =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  root.classList.toggle("dark", effective === "dark");
  root.style.colorScheme = effective;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    setTheme(readCookie());
  }, []);

  // Re-apply when system preference changes while on "system"
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  async function set(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    try {
      await fetch("/api/v1/me/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
    } catch {
      // network failure is non-fatal — cookie set on success only;
      // local class change keeps the session consistent for the user.
    }
  }

  const opts: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: "Claro" },
    { value: "dark", icon: Moon, label: "Escuro" },
    { value: "system", icon: Monitor, label: "Sistema" },
  ];

  if (compact) {
    // Cycle button: light → dark → system → light
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    const Icon =
      theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
    return (
      <button
        type="button"
        onClick={() => set(next)}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition"
        aria-label={`Tema: ${theme}. Trocar para ${next}.`}
        title={`Tema: ${theme}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-center rounded-md border border-gray-700 bg-gray-900/50 p-0.5"
      role="radiogroup"
      aria-label="Escolher tema"
    >
      {opts.map(({ value, icon: Icon, label }) => {
        const active = value === theme;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => set(value)}
            className={
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition " +
              (active
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800")
            }
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
