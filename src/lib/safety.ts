/**
 * Patient Safety — Crisis Keyword Detection
 *
 * Simple keyword matching for Portuguese-language crisis phrases.
 * NOT AI analysis — just a trigger for showing a supportive UI card.
 */

const CRISIS_KEYWORDS_PT = [
  "suicídio",
  "suicidio",
  "me matar",
  "quero morrer",
  "não aguento mais",
  "nao aguento mais",
  "acabar com tudo",
  "autolesão",
  "autolesao",
  "automutilação",
  "automutilacao",
  "me machucar",
  "me cortar",
  "me ferir",
  "vontade de morrer",
  "não vale a pena",
  "nao vale a pena",
  "quero desaparecer",
  "não quero viver",
  "nao quero viver",
];

/**
 * Check if text contains crisis-related keywords.
 * Used to set `flaggedForSupport` on journal entries.
 */
export function containsCrisisKeywords(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS_PT.some((kw) => lower.includes(kw));
}

/**
 * Default crisis resources shown to patients.
 * Can be overridden per tenant via portalSafetyText / portalSafetyCrisisPhone.
 */
export const DEFAULT_CRISIS_RESOURCES = {
  phone: "188",
  service: "CVV — Centro de Valorização da Vida",
  description: "Ligação gratuita, 24 horas, de qualquer telefone.",
  samuPhone: "192",
  disclaimer:
    "Este aplicativo é uma ferramenta de apoio ao seu acompanhamento terapêutico. Não substitui atendimento de emergência.",
};
