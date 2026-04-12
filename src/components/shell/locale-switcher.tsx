"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { Globe } from "lucide-react";

export function LocaleSwitcher() {
  const t = useTranslations("localeSwitcher");
  const currentLocale = useLocale();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleLocaleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const locale = e.target.value as Locale;
    if (!locale || locale === currentLocale) return;

    setIsPending(true);
    try {
      const response = await fetchWithCsrf("/api/set-locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to change locale:", error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <Globe className="absolute start-3 h-4 w-4 text-muted-foreground pointer-events-none" />
      <select
        value={currentLocale}
        onChange={handleLocaleChange}
        disabled={isPending}
        aria-label={t("label")}
        className="appearance-none min-h-11 md:min-h-10 w-[140px] rounded-md border border-input bg-background ps-9 pe-3 py-2 text-base md:text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {t(locale)}
          </option>
        ))}
      </select>
    </div>
  );
}
