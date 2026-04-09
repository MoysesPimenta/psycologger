# Internationalization (i18n) Guide — Psycologger

This document covers the i18n infrastructure, locale file structure, and best practices for adding new translated strings.

## Overview

Psycologger uses **next-intl** for server-side and client-side internationalization. All user-facing text is pulled from JSON message files, with **pt-BR (Brazilian Portuguese) as the default locale** supporting English (en) and Spanish (es) as secondary locales.

### Current Setup
- **Default locale**: pt-BR (used when user hasn't explicitly selected a language)
- **Supported locales**: ["pt-BR", "en", "es"]
- **Message files**: `/messages/{locale}.json` (currently ~443 lines each)
- **i18n config**: `src/i18n/` (request.ts + config.ts)
- **Tenant locale field**: `Tenant.locale` (default: "pt-BR") drives email template language

---

## Message File Structure

All messages are organized by **namespace** to group related strings:

### Core Namespaces

#### `nav` — Main navigation labels
```json
{
  "nav": {
    "today": "Hoje",
    "patients": "Pacientes",
    "calendar": "Agenda",
    "financial": "Financeiro",
    "reports": "Relatórios"
  }
}
```

#### `common` — Universal buttons, actions, states
```json
{
  "common": {
    "save": "Salvar",
    "cancel": "Cancelar",
    "loading": "Carregando...",
    "error": "Erro",
    "success": "Sucesso"
  }
}
```

#### `enums` — Static enum values (appointment status, session type, payment method, frequency)
Enum translations are keyed by the **enum database value** (e.g., `SCHEDULED`, `ONLINE`, `PIX`):

```json
{
  "enums": {
    "appointmentStatus": {
      "SCHEDULED": "Agendada",
      "CONFIRMED": "Confirmada",
      "COMPLETED": "Realizada",
      "CANCELED": "Cancelada",
      "NO_SHOW": "Falta"
    },
    "sessionType": {
      "IN_PERSON": "Presencial",
      "ONLINE": "Online",
      "EVALUATION": "Avaliação",
      "GROUP": "Grupo"
    },
    "paymentMethod": {
      "PIX": "PIX",
      "CASH": "Dinheiro",
      "CARD": "Cartão",
      "TRANSFER": "Transferência",
      "INSURANCE": "Plano de saúde",
      "OTHER": "Outro"
    }
  }
}
```

#### Feature namespaces — `today`, `patients`, `appointments`, `charges`, `calendar`, `financial`, `reports`, `settings`, `audit`, `billing`, `journal`
Each feature domain has its own namespace with page titles, labels, and messages specific to that feature.

#### `portal` — Patient-facing portal
```json
{
  "portal": {
    "dashboard": {
      "greeting": {
        "morning": "Bom dia",
        "afternoon": "Boa tarde",
        "evening": "Boa noite"
      },
      "nextSession": "Próxima sessão",
      "onlineSession": "Online",
      "inPersonSession": "Presencial"
    },
    "payments": {},
    "journal": {}
  }
}
```

#### `forms` — Form placeholders, labels, validation
```json
{
  "forms": {
    "placeholders": {
      "nameSample": "Dra. Ana Silva",
      "searchPatient": "Buscar paciente..."
    },
    "validation": {
      "requiredField": "Este campo é obrigatório",
      "invalidEmail": "Email inválido"
    }
  }
}
```

#### `errors` — Generic error messages
```json
{
  "errors": {
    "loadFailed": "Erro ao carregar dados. Tente novamente.",
    "connectionError": "Erro de conexão. Tente novamente.",
    "saveFailed": "Erro ao salvar alterações",
    "unknownError": "Erro desconhecido"
  }
}
```

#### `emails` — Email template strings (subject, greeting, link text, etc.)
```json
{
  "emails": {
    "magicLinkSubject": "Seu link de acesso ao Psycologger",
    "magicLinkButton": "Entrar na minha conta",
    "appointmentConfirmationSubject": "Confirmação de consulta",
    "chargeAmount": "Valor",
    "chargeDueDate": "Vencimento"
  }
}
```

#### `localeSwitcher` — Language selector labels
```json
{
  "localeSwitcher": {
    "label": "Idioma",
    "pt-BR": "Português",
    "en": "English",
    "es": "Español"
  }
}
```

---

## Using Translations in Code

### Client Components (`"use client"`)
```tsx
import { useTranslations } from "next-intl";

export function MyComponent() {
  const t = useTranslations(); // or useTranslations("namespace")
  
  return (
    <>
      <h1>{t("common.save")}</h1>
      <button>{t("appointments.statusScheduled")}</button>
      <p>{t("enums.sessionType.ONLINE")}</p>
    </>
  );
}
```

### Server Components
```tsx
import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("patients");
  return <h1>{t("newPatient")}</h1>;
}
```

### Scoped Translations
Use namespace argument to avoid repeating prefix:
```tsx
const t = useTranslations("charges"); // scoped to "charges" namespace
return <p>{t("amount")}</p>; // translates to "charges.amount"
```

---

## Adding New Strings

### 1. **Identify the namespace** where the string belongs
   - Feature domain (e.g., `appointments`, `financial`)
   - Or generic (e.g., `common`, `errors`, `forms`)

### 2. **Add key and value to all locale files**
   - Always update **both** pt-BR.json and en.json simultaneously
   - Follow existing naming conventions (camelCase for keys)

Example: Adding a new error message
```json
// messages/pt-BR.json
{
  "errors": {
    "appointmentConflict": "Horário já ocupado. Escolha outro horário."
  }
}

// messages/en.json
{
  "errors": {
    "appointmentConflict": "Time slot already occupied. Please choose another."
  }
}
```

### 3. **Use the translation in code**
```tsx
if (conflictFound) {
  setError(t("errors.appointmentConflict"));
}
```

---

## Email Localization via `Tenant.locale`

Email templates should respect the **tenant's preferred locale** (from `Tenant.locale` field), not the current user's session locale.

### Pattern
```tsx
// src/lib/email.ts
export async function sendAppointmentReminder(props: {
  to: string;
  appointmentDate: string;
  tenantId: string; // ← fetch tenant.locale
}) {
  // Fetch tenant to get locale
  const tenant = await db.tenant.findUnique({ where: { id: props.tenantId } });
  const locale = tenant?.locale ?? "pt-BR";
  
  // Create a translator for the tenant's locale
  const messages = locale === "en" 
    ? (await import("../../messages/en.json")).default
    : (await import("../../messages/pt-BR.json")).default;
  
  const subject = messages.emails.appointmentReminderSubject;
  const dateLabel = messages.emails.date;
  
  // Build HTML with localized strings
  const html = `
    <h2>${subject}</h2>
    <p>${dateLabel}: ${props.appointmentDate}</p>
  `;
  
  return sendEmail({ to: props.to, subject, html });
}
```

**Do not hardcode email text.** Always pull from the message file keyed on tenant locale.

---

## PT-BR First Policy

- **Default locale is pt-BR** for all Brazilian therapists
- English/Spanish are fallback locales for future mobile and international expansion
- Changes to user experience should first be implemented in PT-BR
- All translations should be checked by native speakers for accuracy

---

## Remaining Work (TODO)

The following areas still have hardcoded strings and are marked with TODO comments:

### Portal & Components
- [ ] Entry type labels in `portal-dashboard-client.tsx` (MOOD_CHECKIN, REFLECTION, etc.)
- [ ] Tab labels ("Próximas", "Anteriores") in `portal-sessions-client.tsx`
- [ ] Empty state messages in portal components
- [ ] "Last login" label and IP display formatting

### Forms
- [ ] Appointment type form placeholders
- [ ] Patient form validation error messages
- [ ] Charge form field labels and help text

### Email Templates
- [ ] Appointment confirmation templates — move all text to emails namespace
- [ ] Payment reminder templates — localize amount/date formatting per locale
- [ ] Invoice headers and footers

### Settings Pages
- [ ] Appointment types list and edit forms
- [ ] Reminder template editor strings
- [ ] Export data section error messages

---

## Adding a New Locale

To add a new locale (e.g., German "de"):

1. **Add to `src/i18n/config.ts`:**
   ```ts
   export const locales = ["pt-BR", "en", "es", "de"] as const;
   ```

2. **Create `messages/de.json`:** Copy from en.json and translate all strings

3. **Update `src/i18n/request.ts` if needed:** (Usually auto-detected by file import)

4. **Test:**
   - Set NEXT_LOCALE cookie to "de" in browser dev tools
   - Verify all pages display German text
   - Test locale switcher UI

---

## Testing & Validation

Run **before pushing**:
```bash
# Type check
npx tsc --noEmit

# Test translations exist in all locales
# (manual spot-check a few pages in each language)
```

---

## FAQs

**Q: Can I hardcode text in JSX?**
A: No. All user-facing text must go through i18n. Only code comments, console logs, and error codes are exempt.

**Q: What if I need dynamic text in translations?**
A: Use template variables or JSX interpolation:
```tsx
t("welcomeUser", { name: userData.name })
// Message: "Bem-vindo, {name}!"
```

**Q: How do enums work?**
A: Enum translations map database values to display labels. Always translate the **database value** (uppercase), not the display label:
```tsx
t(`enums.appointmentStatus.${appt.status}`)
// status = "SCHEDULED" → looks up enums.appointmentStatus.SCHEDULED → "Agendada"
```

**Q: Can I use translations in server-side validators?**
A: Not reliably (validator runs before locale is resolved). Use error codes instead and localize on client or in API response error message.

---

**Last updated**: 2026-04-09  
**Extraction status**: ~80% of user-facing strings across top 50 files  
**Remaining**: 20% marked with TODO comments for future PRs
