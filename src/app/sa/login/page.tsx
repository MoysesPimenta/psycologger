"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";

export default function SALoginPage() {
  const t = useTranslations("sa");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: "/sa/dashboard",
      });
      if (res?.error) {
        setError(t("login.sendError"));
      } else {
        setSent(true);
      }
    } catch {
      setError(t("login.networkError"));
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("dashboard.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{t("dashboard.subtitle")}</p>
        </div>

        {sent ? (
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">
            <p className="text-emerald-600 dark:text-green-400 font-medium">{t("login.linkSent")}</p>
            <p className="text-gray-600 dark:text-gray-400 text-sm mt-2">
              {t("login.checkEmail", { email })}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm text-gray-700 dark:text-gray-300">{t("login.emailLabel")}</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-500"
                placeholder={t("login.emailPlaceholder")}
              />
            </div>
            {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-brand-600 dark:bg-brand-600 hover:bg-brand-500 dark:hover:bg-brand-500 text-white dark:text-white font-medium rounded-md px-4 py-2 text-sm transition-colors"
            >
              {t("login.sendButton")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
