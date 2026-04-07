"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { locales, defaultLocale } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Globe } from "lucide-react";

export function LocaleSwitcher() {
  const t = useTranslations("localeSwitcher");
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleLocaleChange = async (locale: Locale) => {
    setIsPending(true);
    try {
      // Set the NEXT_LOCALE cookie via a fetch request to a server action
      const response = await fetch("/api/set-locale", {
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
    <Select onValueChange={handleLocaleChange} disabled={isPending}>
      <SelectTrigger className="w-[140px]" title={t("label")}>
        <Globe className="h-4 w-4 mr-2" />
        <SelectValue placeholder={t("label")} />
      </SelectTrigger>
      <SelectContent>
        {locales.map((locale) => (
          <SelectItem key={locale} value={locale}>
            {t(locale)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
