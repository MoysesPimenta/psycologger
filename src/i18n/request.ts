import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, locales } from "./config";
import type { Locale } from "./config";

/**
 * Helper to parse Accept-Language header and extract the best matching locale.
 */
function parseAcceptLanguage(header: string): Locale | null {
  const languages = header.split(",").map((lang) => {
    const [code, q] = lang.trim().split(";");
    const quality = q ? parseFloat(q.split("=")[1]) : 1;
    return { code: code.trim(), quality };
  });

  languages.sort((a, b) => b.quality - a.quality);

  for (const lang of languages) {
    // Exact match (e.g., "pt-BR")
    if (locales.includes(lang.code as Locale)) {
      return lang.code as Locale;
    }
    // Language prefix match (e.g., "pt" -> "pt-BR", "en" -> "en")
    const prefix = lang.code.split("-")[0];
    const match = locales.find((l) => l.startsWith(prefix));
    if (match) return match as Locale;
  }

  return null;
}

/**
 * Get the current locale from:
 * 1. NEXT_LOCALE cookie (highest priority)
 * 2. Accept-Language header
 * 3. Default locale (pt-BR)
 */
async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const localeFromCookie = cookieStore.get("NEXT_LOCALE")?.value;

  if (localeFromCookie && locales.includes(localeFromCookie as Locale)) {
    return localeFromCookie as Locale;
  }

  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language");

  if (acceptLanguage) {
    const localeFromHeader = parseAcceptLanguage(acceptLanguage);
    if (localeFromHeader) {
      return localeFromHeader;
    }
  }

  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await getLocale();

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
