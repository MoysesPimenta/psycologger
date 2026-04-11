export const locales = ["pt-BR", "en", "es", "he", "it", "fr", "de"] as const;
export const defaultLocale = "pt-BR" as const;

export type Locale = (typeof locales)[number];

/** Locales that use right-to-left text direction */
export const rtlLocales: readonly Locale[] = ["he"] as const;

/** Check if a locale uses RTL direction */
export function isRtlLocale(locale: Locale): boolean {
  return (rtlLocales as readonly string[]).includes(locale);
}
