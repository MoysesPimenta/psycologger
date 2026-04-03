# Patient Portal — System Design Document

**Version**: 1.0
**Date**: 2026-04-03
**Status**: Ready for implementation

---

## 1. Architecture Overview

### 1.1 Design Decision: Same App, Separate Route Tree

The patient portal lives inside the existing Next.js app as a parallel route tree `/portal/*`, sharing the same database, API layer, and deployment. This avoids microservice overhead while maintaining strict data isolation through RBAC.

```
┌──────────────────────────────────────────────────────────────┐
│                      Next.js 14 App                          │
├────────────────────────┬─────────────────────────────────────┤
│  /app/* (Therapist)    │  /portal/* (Patient)                │
│  ─────────────────     │  ────────────────────               │
│  AppSidebar layout     │  PortalShell layout                 │
│  RBAC: 5 staff roles   │  RBAC: PATIENT role                 │
│  Membership-based      │  PatientAuth-based                  │
│  Full clinical access  │  Own-data-only access               │
├────────────────────────┴─────────────────────────────────────┤
│                   Shared API Layer                            │
│  /api/v1/*  (staff)  │  /api/v1/portal/*  (patient)          │
├──────────────────────────────────────────────────────────────┤
│                     Prisma + PostgreSQL                       │
│  Existing models (Patient, Appointment, Charge, etc.)        │
│  + New models (PatientAuth, JournalEntry, PatientNotif, etc) │
└──────────────────────────────────────────────────────────────┘
```

**Trade-offs**:

| Approach | Pros | Cons |
|----------|------|------|
| Same app, separate routes ✓ | Single deploy, shared DB, reuse libs | Larger bundle, shared failure domain |
| Separate Next.js app | Independent scaling, smaller bundles | Duplicate infra, cross-app auth complexity |
| Separate backend + SPA | Decoupled frontend | Double the code, CORS, auth sync |

We choose option 1 because the patient portal has low traffic relative to the therapist app, and sharing the Prisma client, email system, audit logging, and rate limiting avoids significant duplication.

### 1.2 Authentication Split

Staff and patients use **separate authentication flows** but the same NextAuth instance:

- **Staff**: Email magic link → User table → Membership → Role (existing)
- **Patients**: Invite activation → PatientAuth table → Patient record → PATIENT role (new)

The `PatientAuth` model links a login identity to a `Patient` record. This keeps the existing `User` table clean (staff only) while reusing NextAuth's JWT infrastructure.

### 1.3 Route Protection

```
Middleware (src/middleware.ts)
├── Public:       /, /login, /signup, /invite/*, /portal/login, /portal/activate/*
├── Staff:        /app/*     → requires User + Membership
├── Patient:      /portal/*  → requires PatientAuth + active Patient
├── SuperAdmin:   /sa/*      → requires User.isSuperAdmin
└── API:
    ├── /api/v1/*         → staff auth (getAuthContext)
    └── /api/v1/portal/*  → patient auth (getPatientContext)
```

---

## 2. Data Model

### 2.1 New Enums

```prisma
enum JournalEntryType {
  MOOD_CHECKIN
  REFLECTION
  SESSION_PREP
  QUESTION
  IMPORTANT_EVENT
  GRATITUDE
}

enum JournalVisibility {
  PRIVATE          // Patient-only — therapist CANNOT see
  SHARED           // Visible to assigned therapist
  DRAFT            // Work in progress — not visible to therapist
}

enum PatientNotificationType {
  SESSION_REMINDER
  PAYMENT_REMINDER
  PRE_SESSION_PROMPT
  ENTRY_REVIEWED
  GENERAL
}

enum ConsentType {
  TERMS_OF_USE
  PRIVACY_POLICY
  DATA_SHARING
  JOURNAL_SHARING
}
```

### 2.2 New Models

```prisma
// ─── Patient Authentication ──────────────────────────────────────────────────

model PatientAuth {
  id              String    @id @default(uuid()) @db.Uuid
  patientId       String    @db.Uuid
  tenantId        String    @db.Uuid
  email           String
  passwordHash    String?               // null = magic-link only
  emailVerified   Boolean   @default(false)
  emailVerifiedAt DateTime?
  status          String    @default("ACTIVE") // ACTIVE, SUSPENDED, DEACTIVATED
  lastLoginAt     DateTime?
  loginAttempts   Int       @default(0)
  lockedUntil     DateTime?
  activatedAt     DateTime?
  activationToken String?   @unique

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  patient         Patient   @relation(fields: [patientId], references: [id], onDelete: Cascade)
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  sessions        PatientSession[]

  @@unique([tenantId, email])
  @@unique([tenantId, patientId])  // one portal login per patient per tenant
  @@index([tenantId])
  @@index([email])
}

model PatientSession {
  id              String    @id @default(uuid()) @db.Uuid
  patientAuthId   String    @db.Uuid
  tokenHash       String    @unique
  userAgent       String?
  ipAddress       String?
  expiresAt       DateTime
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())

  patientAuth     PatientAuth @relation(fields: [patientAuthId], references: [id], onDelete: Cascade)

  @@index([patientAuthId])
  @@index([expiresAt])
}

// ─── Patient Preferences ─────────────────────────────────────────────────────

model PatientPreference {
  id                          String   @id @default(uuid()) @db.Uuid
  patientId                   String   @unique @db.Uuid
  tenantId                    String   @db.Uuid

  // Notifications
  notifySessionReminder       Boolean  @default(true)
  notifyPaymentReminder       Boolean  @default(true)
  notifyPreSessionPrompt      Boolean  @default(true)
  reminderHoursBefore         Int      @default(24)

  // Defaults
  defaultJournalVisibility    JournalVisibility @default(PRIVATE)
  timezone                    String   @default("America/Sao_Paulo")

  // Emergency
  emergencyContactName        String?
  emergencyContactPhone       String?
  emergencyContactRelation    String?

  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  patient                     Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
  tenant                      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

// ─── Journal Entries (Mood / Thoughts / Notes) ───────────────────────────────

model JournalEntry {
  id                  String             @id @default(uuid()) @db.Uuid
  tenantId            String             @db.Uuid
  patientId           String             @db.Uuid
  therapistId         String?            @db.Uuid   // assigned therapist at time of creation

  entryType           JournalEntryType
  visibility          JournalVisibility  @default(PRIVATE)

  // Scores (all optional — patient fills what feels right)
  moodScore           Int?               // 1–10
  anxietyScore        Int?               // 1–10
  energyScore         Int?               // 1–10
  sleepScore          Int?               // 1–10

  // Content
  emotionTags         String[]           @default([])
  noteText            String?            // encrypted at rest via app layer
  discussNextSession  Boolean            @default(false)

  // Safety
  flaggedForSupport   Boolean            @default(false)  // auto-set by keyword detection

  // Therapist review
  reviewedAt          DateTime?
  reviewedById        String?            @db.Uuid

  // Soft delete
  deletedAt           DateTime?

  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  tenant              Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patient             Patient            @relation(fields: [patientId], references: [id], onDelete: Cascade)
  therapist           User?              @relation("JournalTherapist", fields: [therapistId], references: [id], onDelete: SetNull)
  reviewer            User?              @relation("JournalReviewer", fields: [reviewedById], references: [id], onDelete: SetNull)

  @@index([tenantId, patientId])
  @@index([tenantId, therapistId, visibility])  // therapist inbox query
  @@index([tenantId, patientId, createdAt])
  @@index([tenantId, discussNextSession])
}

// ─── Patient Notifications ───────────────────────────────────────────────────

model PatientNotification {
  id                  String                    @id @default(uuid()) @db.Uuid
  tenantId            String                    @db.Uuid
  patientId           String                    @db.Uuid
  type                PatientNotificationType
  title               String
  body                String
  readAt              DateTime?
  relatedEntityType   String?                   // "Appointment", "Charge", "JournalEntry"
  relatedEntityId     String?                   @db.Uuid

  createdAt           DateTime                  @default(now())

  tenant              Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patient             Patient   @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([tenantId, patientId, readAt])
  @@index([tenantId, patientId, createdAt])
}

// ─── Consent Records ─────────────────────────────────────────────────────────

model ConsentRecord {
  id                  String       @id @default(uuid()) @db.Uuid
  tenantId            String       @db.Uuid
  patientId           String       @db.Uuid
  consentType         ConsentType
  version             String                    // e.g., "2026-04-01"
  acceptedAt          DateTime
  revokedAt           DateTime?
  ipAddress           String?
  userAgent           String?

  tenant              Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  patient             Patient   @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([tenantId, patientId])
  @@index([tenantId, patientId, consentType])
}
```

### 2.3 Extensions to Existing Models

```prisma
// Add to Patient model:
model Patient {
  // ... existing fields ...

  // New relations
  portalAuth          PatientAuth?
  preference          PatientPreference?
  journalEntries      JournalEntry[]
  patientNotifications PatientNotification[]
  consentRecords      ConsentRecord[]
}

// Add to Tenant model:
model Tenant {
  // ... existing fields ...

  // Patient portal feature flags
  portalEnabled              Boolean @default(false)
  portalPaymentsVisible      Boolean @default(true)
  portalJournalEnabled       Boolean @default(true)
  portalRescheduleEnabled    Boolean @default(false)
  portalVideoLinkAdvanceMin  Int     @default(60)     // show link N min before
  portalSafetyText           String? // custom crisis text per clinic
  portalSafetyCrisisPhone    String? // e.g., CVV 188

  // New relations
  patientAuths         PatientAuth[]
  patientPreferences   PatientPreference[]
  journalEntries       JournalEntry[]
  patientNotifications PatientNotification[]
  consentRecords       ConsentRecord[]
}
```

### 2.4 Index Strategy for Key Queries

| Query | Index |
|-------|-------|
| Patient login | `PatientAuth(tenantId, email)` unique |
| Patient's journal timeline | `JournalEntry(tenantId, patientId, createdAt)` |
| Therapist inbox (shared entries) | `JournalEntry(tenantId, therapistId, visibility)` |
| Discuss-next-session entries | `JournalEntry(tenantId, discussNextSession)` |
| Unread notifications | `PatientNotification(tenantId, patientId, readAt)` |
| Session cleanup | `PatientSession(expiresAt)` |

---

## 3. API Design

### 3.1 Patient Authentication APIs

All patient APIs live under `/api/v1/portal/` with a dedicated `getPatientContext()` helper that mirrors `getAuthContext()` but resolves from `PatientAuth` instead of `User`+`Membership`.

```
POST   /api/v1/portal/auth/activate      Activate account from invite
POST   /api/v1/portal/auth/login          Email + password login
POST   /api/v1/portal/auth/magic-link     Request magic link
POST   /api/v1/portal/auth/verify-email   Verify email token
POST   /api/v1/portal/auth/forgot         Request password reset
POST   /api/v1/portal/auth/reset          Reset password with token
POST   /api/v1/portal/auth/logout         Revoke current session
GET    /api/v1/portal/auth/sessions       List active sessions (device mgmt)
DELETE /api/v1/portal/auth/sessions/[id]  Revoke specific session
```

**Rate limits**: 5 login attempts per 15min per IP; 3 magic-link requests per hour per email.

### 3.2 Patient Data APIs

```
GET    /api/v1/portal/dashboard           Aggregated dashboard data
GET    /api/v1/portal/appointments         Upcoming + past (paginated)
GET    /api/v1/portal/appointments/[id]    Detail (patient-safe fields only)
POST   /api/v1/portal/appointments/[id]/confirm   Attendance confirmation
POST   /api/v1/portal/appointments/[id]/reschedule-request  (if enabled)

GET    /api/v1/portal/charges              Payment history (paginated)
GET    /api/v1/portal/charges/[id]         Invoice/receipt detail

GET    /api/v1/portal/journal              Own entries (paginated)
POST   /api/v1/portal/journal              Create entry
GET    /api/v1/portal/journal/[id]         Get entry
PATCH  /api/v1/portal/journal/[id]         Edit entry (own, not yet reviewed)
DELETE /api/v1/portal/journal/[id]         Soft-delete (own, not yet reviewed)

GET    /api/v1/portal/notifications        Notifications (paginated)
PATCH  /api/v1/portal/notifications/[id]   Mark read
POST   /api/v1/portal/notifications/read-all  Mark all read

GET    /api/v1/portal/profile              Get profile + preferences
PATCH  /api/v1/portal/profile              Update preferences
GET    /api/v1/portal/consents             Consent history
POST   /api/v1/portal/consents             Accept consent
```

### 3.3 Therapist-Side APIs (Shared Entry Inbox)

These extend the existing staff API, protected by existing RBAC:

```
GET    /api/v1/journal-inbox               Shared entries for assigned patients
GET    /api/v1/journal-inbox/[id]          Entry detail
PATCH  /api/v1/journal-inbox/[id]/review   Mark as reviewed
```

**Permission**: `journal:viewShared` — granted to PSYCHOLOGIST, TENANT_ADMIN.

### 3.4 Patient Context Helper

```typescript
// src/lib/patient-auth.ts

interface PatientContext {
  patientAuthId: string;
  patientId: string;
  tenantId: string;
  email: string;
  tenant: {
    portalEnabled: boolean;
    portalPaymentsVisible: boolean;
    portalJournalEnabled: boolean;
    portalRescheduleEnabled: boolean;
    portalVideoLinkAdvanceMin: number;
    portalSafetyText: string | null;
    portalSafetyCrisisPhone: string | null;
  };
}

async function getPatientContext(req: NextRequest): Promise<PatientContext>
// 1. Extract JWT from cookie (portal-token)
// 2. Validate token, check PatientSession not revoked
// 3. Load PatientAuth + Patient + Tenant
// 4. Verify PatientAuth.status === "ACTIVE"
// 5. Verify Tenant.portalEnabled === true
// 6. Return PatientContext
```

### 3.5 Data Isolation Rules

| Data | Patient Sees | Therapist Sees |
|------|-------------|----------------|
| Appointments | Own only, patient-safe fields (no adminNotes) | All for assigned patients |
| Charges/Payments | Own only, friendly status labels | All for assigned patients |
| Clinical Sessions | NEVER (therapist notes are private) | Full access per RBAC |
| Journal Entries (PRIVATE) | Own only | NEVER — enforced at DB query level |
| Journal Entries (SHARED) | Own only | Assigned patients' shared entries |
| Journal Entries (DRAFT) | Own only | NEVER |
| Patient Contacts | Own emergency contacts | All contacts |
| Files | Never (clinical files are therapist-owned) | Per RBAC |

**Critical enforcement**: Every patient API query includes `WHERE patientId = ctx.patientId AND tenantId = ctx.tenantId`. Journal visibility filtering is applied at the **database query level**, not in application code:

```typescript
// Therapist inbox — ONLY shared entries
WHERE visibility = 'SHARED' AND therapistId = ctx.userId

// Patient view — ALL own entries (including private)
WHERE patientId = ctx.patientId
```

---

## 4. Patient App Screens

### 4.1 Route Tree

```
/portal/
├── login                    Login page
├── activate/[token]         Account activation
├── forgot-password          Password reset request
├── reset-password/[token]   Password reset form
│
├── (authenticated layout — PortalShell)
│   ├── dashboard            Home / overview
│   ├── sessions             Upcoming + past appointments
│   ├── sessions/[id]        Session detail
│   ├── payments             Payment history
│   ├── payments/[id]        Invoice / receipt
│   ├── journal              Entry timeline
│   ├── journal/new          New entry (quick flow)
│   ├── journal/[id]         Entry detail / edit
│   ├── notifications        Notification center
│   ├── profile              Profile & preferences
│   ├── privacy              Privacy & consent
│   └── help                 Support / emergency resources
```

### 4.2 Screen Specifications

**Dashboard** — The emotional center of the app

```
┌─────────────────────────────────────────┐
│  Bom dia, {preferredName || firstName}  │
│                                         │
│  ┌─ Próxima sessão ──────────────────┐  │
│  │  Qua, 10 Abr · 14:00             │  │
│  │  Dr. Silva · Online               │  │
│  │  [Preparar nota]   [Ver detalhes] │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─ Como você está? ─────────────────┐  │
│  │  😔  😐  🙂  😊  😄              │  │
│  │  Toque para registrar             │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─ Pagamentos ──────────────────────┐  │
│  │  1 pendente · R$ 250,00           │  │
│  │  Vence em 3 dias                  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─ Últimas anotações ───────────────┐  │
│  │  Hoje · Humor: 7/10              │  │
│  │  Ontem · Reflexão: "Conversa..." │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Journal New Entry** — Under 15 seconds to complete

```
┌─────────────────────────────────────────┐
│  ← Nova anotação                        │
│                                         │
│  Como você está? (opcional)             │
│  ───── ● ─────────  7/10               │
│                                         │
│  Tipo                                   │
│  [Humor] [Reflexão] [Próxima sessão]    │
│  [Pergunta] [Evento] [Gratidão]         │
│                                         │
│  Emoções (opcional)                     │
│  [ansiedade] [calma] [tristeza] [+]     │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ Escreva o que quiser...           │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ☐ Discutir na próxima sessão          │
│                                         │
│  Visibilidade                           │
│  ○ Privado (só você vê)               │
│  ○ Compartilhado com terapeuta         │
│  ○ Rascunho                            │
│                                         │
│  [Salvar]                               │
└─────────────────────────────────────────┘
```

**Sessions List**

```
┌─────────────────────────────────────────┐
│  Sessões                                │
│  [Próximas] [Anteriores]                │
│                                         │
│  Qua, 10 Abr · 14:00 – 14:50          │
│  Dr. Silva · Online · Agendada         │
│                                         │
│  Seg, 7 Abr · 10:00 – 10:50           │
│  Dr. Silva · Presencial · Realizada    │
│                                         │
│  Qui, 3 Abr · 14:00 – 14:50           │
│  Dr. Silva · Online · Realizada        │
└─────────────────────────────────────────┘
```

**Payments List**

```
┌─────────────────────────────────────────┐
│  Pagamentos                             │
│  [Pendentes] [Pagos] [Todos]            │
│                                         │
│  Consulta 10/04 — R$ 250,00            │
│  Vence 15/04 · Pendente                │
│                                         │
│  Consulta 03/04 — R$ 250,00            │
│  Pago em 03/04 · PIX                   │
└─────────────────────────────────────────┘
```

### 4.3 Portal Shell Layout

```typescript
// src/app/portal/(authenticated)/layout.tsx
// Mobile-first bottom navigation bar

<div className="min-h-screen bg-slate-50">
  <main className="pb-20 px-4 pt-6 max-w-lg mx-auto">
    {children}
  </main>

  {/* Bottom nav — mobile */}
  <nav className="fixed bottom-0 inset-x-0 bg-white border-t safe-area-pb">
    <div className="flex justify-around py-2">
      <NavItem icon={Home} label="Início" href="/portal/dashboard" />
      <NavItem icon={Calendar} label="Sessões" href="/portal/sessions" />
      <NavItem icon={PenLine} label="Diário" href="/portal/journal" />
      <NavItem icon={CreditCard} label="Pagamentos" href="/portal/payments" />
      <NavItem icon={User} label="Perfil" href="/portal/profile" />
    </div>
  </nav>
</div>
```

---

## 5. Safety Design

### 5.1 Crisis Keyword Detection

When a patient saves a journal entry, the server scans `noteText` for crisis-related Portuguese keywords. This is NOT AI analysis — it is a simple keyword match used only to trigger a supportive UI response.

```typescript
const CRISIS_KEYWORDS_PT = [
  "suicídio", "suicidio", "me matar", "quero morrer",
  "não aguento mais", "acabar com tudo",
  "autolesão", "automutilação", "me machucar",
];

function containsCrisisKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS_PT.some(kw => lower.includes(kw));
}
```

### 5.2 Safety Response Flow

When `flaggedForSupport` is set:

1. **Immediate UI**: Show a calm, non-alarming support card:

```
┌─────────────────────────────────────────┐
│  💙 Notamos que você pode estar         │
│  passando por um momento difícil.       │
│                                         │
│  Você não está sozinho(a).              │
│                                         │
│  Se precisar de apoio imediato:         │
│  📞 CVV: 188 (24h, gratuito)           │
│  📞 SAMU: 192                           │
│  📞 {emergencyContact}                  │
│                                         │
│  {clinic.portalSafetyText}              │
│                                         │
│  Este aplicativo não substitui          │
│  atendimento de emergência.             │
└─────────────────────────────────────────┘
```

2. **Server-side**: Set `flaggedForSupport = true` on the entry.
3. **No automatic therapist notification** unless the clinic has explicitly enabled and disclosed this workflow.
4. **Audit log**: Record the flag event with PHI redaction.

### 5.3 Disclaimers

Every portal page includes a footer:

> Este aplicativo é uma ferramenta de apoio ao seu acompanhamento terapêutico. Não substitui atendimento de emergência. Em caso de crise, ligue 188 (CVV) ou 192 (SAMU).

The onboarding/consent flow includes explicit acknowledgment that the app does not provide real-time monitoring.

---

## 6. Therapist-Side Integration

### 6.1 Shared Entry Inbox

New section in the therapist sidebar: **"Diário do Paciente"** (Patient Journal)

```
┌─────────────────────────────────────────┐
│  Diário dos Pacientes                   │
│  [Não lidos] [Próxima sessão] [Todos]   │
│                                         │
│  Ana Silva · Humor: 4/10 · Há 2h       │
│  "Tive uma crise de ansiedade..."       │
│  🏷️ Discutir na próxima sessão          │
│  ● Não lido                             │
│                                         │
│  Carlos Lima · Reflexão · Ontem         │
│  "Percebi que o padrão..."             │
│  ✓ Revisado em 02/04                    │
└─────────────────────────────────────────┘
```

### 6.2 Entry Detail (Therapist View)

```
┌─────────────────────────────────────────┐
│  ← Ana Silva · Check-in de Humor        │
│                                         │
│  03/04/2026 · 14:32                     │
│  Humor: 4/10 · Ansiedade: 8/10         │
│  Energia: 3/10 · Sono: 5/10            │
│                                         │
│  Emoções: ansiedade, medo, cansaço      │
│                                         │
│  "Tive uma crise de ansiedade forte     │
│   no trabalho. Não consegui respirar    │
│   direito por uns 10 minutos."          │
│                                         │
│  🏷️ Paciente quer discutir na sessão    │
│                                         │
│  [Marcar como revisado]                 │
└─────────────────────────────────────────┘
```

### 6.3 Integration Points

- **Patient detail page**: New "Diário" tab showing shared entries timeline
- **Pre-session view**: "Discuss next session" entries highlighted before appointment
- **Audit log**: All therapist reviews of shared entries are logged

---

## 7. Security & Compliance

### 7.1 Authentication Security

| Measure | Implementation |
|---------|---------------|
| Password hashing | bcrypt with cost factor 12 |
| Brute force protection | 5 attempts → 15min lockout; progressive delay |
| Session tokens | crypto.randomBytes(32), stored as SHA-256 hash |
| Session expiry | 7 days; configurable per tenant |
| Device management | List + revoke active sessions |
| Magic link tokens | 32-byte random, single-use, 30min expiry |
| Email verification | Required before accessing clinical data |
| Future 2FA | TOTP column reserved in PatientAuth |

### 7.2 Data Protection

| Requirement | Implementation |
|-------------|---------------|
| Encryption in transit | TLS 1.2+ (Vercel default) |
| Encryption at rest | Journal noteText encrypted via libsodium (existing crypto.ts) |
| Tenant isolation | Every query includes tenantId + patientId |
| PHI in audit logs | Redacted (existing audit.ts pattern) |
| Push notification content | Title only, no body preview by default |
| Session cookie | HttpOnly, Secure, SameSite=Lax, path=/portal |
| LGPD consent | Versioned consent records with accept/revoke timestamps |

### 7.3 RBAC Extension

Add `PATIENT` to the permission map:

```typescript
const PATIENT_PERMISSIONS = [
  "portal:access",
  "portal:viewOwnAppointments",
  "portal:viewOwnCharges",
  "portal:journal:create",
  "portal:journal:editOwn",
  "portal:journal:deleteOwn",
  "portal:notifications:view",
  "portal:profile:edit",
  "portal:consent:manage",
];

// Staff permissions for journal inbox
const JOURNAL_INBOX_PERMISSIONS = [
  "journal:viewShared",    // PSYCHOLOGIST, TENANT_ADMIN
  "journal:markReviewed",  // PSYCHOLOGIST, TENANT_ADMIN
];
```

---

## 8. Feature Flags (Tenant-Level)

| Flag | Default | Controls |
|------|---------|----------|
| `portalEnabled` | false | Entire patient portal on/off |
| `portalPaymentsVisible` | true | Payment module visibility |
| `portalJournalEnabled` | true | Journal/mood module on/off |
| `portalRescheduleEnabled` | false | Reschedule request button |
| `portalVideoLinkAdvanceMin` | 60 | Minutes before session to show video link |
| `portalSafetyText` | null | Custom clinic crisis text |
| `portalSafetyCrisisPhone` | null | Custom crisis phone (default: CVV 188) |

---

## 9. Email Templates (New)

| Template | Trigger | Content |
|----------|---------|---------|
| Patient Invite | Therapist invites patient to portal | Activation link, clinic name |
| Patient Welcome | Account activated | Getting started guide |
| Magic Link (Patient) | Patient requests magic link | Login link, 30min expiry |
| Password Reset | Forgot password | Reset link, 1h expiry |
| Pre-Session Prompt | 24h before appointment | "Add a note for your session?" |
| Entry Reviewed | Therapist marks entry as reviewed | "Your therapist saw your note" |

---

## 10. Implementation Plan

### Phase 1: Foundation (Estimated: 3–4 days)

```
1.1  Prisma schema additions (new models + tenant flags)
1.2  Migration file
1.3  PatientAuth system (register, login, sessions, JWT)
1.4  getPatientContext() helper
1.5  Middleware updates (portal route protection)
1.6  Portal layout shell (mobile-first bottom nav)
1.7  Login / activation / forgot-password pages
```

### Phase 2: Core Modules (Estimated: 4–5 days)

```
2.1  Dashboard API + page
2.2  Sessions list + detail API + pages
2.3  Payments list + detail API + pages
2.4  Journal CRUD API + pages (create, list, detail, edit)
2.5  Mood score input component (slider + emoji)
2.6  Visibility selector component
2.7  Safety keyword detection + crisis card
```

### Phase 3: Integration (Estimated: 2–3 days)

```
3.1  Notifications API + in-app center
3.2  Profile + preferences page
3.3  Consent management page
3.4  Therapist inbox API + page
3.5  Patient detail "Diário" tab
3.6  Pre-session "discuss" highlight
```

### Phase 4: Polish & Security (Estimated: 2 days)

```
4.1  Email templates (invite, welcome, magic link, prompt)
4.2  Audit logging on all patient actions
4.3  Rate limiting on patient endpoints
4.4  Empty states, loading skeletons, error boundaries
4.5  Mobile responsive polish
4.6  Accessibility pass (ARIA, keyboard nav, focus traps)
```

### Phase 5: Testing & QA (Estimated: 2 days)

```
5.1  Permission tests (patient can't see other patients)
5.2  Visibility tests (therapist can't see PRIVATE entries)
5.3  Auth tests (brute force, session revocation, token expiry)
5.4  Safety flow tests (keyword detection, crisis card)
5.5  Seed data for development
5.6  TypeScript compilation check
5.7  Production readiness checklist
```

---

## 11. Test Plan

### 11.1 Permission Tests

```
✓ Patient A cannot see Patient B's appointments
✓ Patient A cannot see Patient B's charges
✓ Patient A cannot see Patient B's journal entries
✓ Patient cannot access /app/* (staff) routes
✓ Staff cannot access /portal/* routes via staff session
✓ Patient with SUSPENDED status gets 403
✓ Patient in tenant with portalEnabled=false gets 403
```

### 11.2 Journal Visibility Tests

```
✓ PRIVATE entry: patient can read, therapist query returns 0 results
✓ SHARED entry: patient can read, therapist inbox shows it
✓ DRAFT entry: patient can read, therapist query returns 0 results
✓ Patient changes PRIVATE→SHARED: therapist can now see it
✓ Patient changes SHARED→PRIVATE: therapist can no longer see it
✓ Therapist marks SHARED entry as reviewed: reviewedAt set
✓ Patient cannot edit entry after therapist has reviewed it
✓ Journal API never returns noteText for therapist (returns decrypted only for patient)
```

### 11.3 Authentication Tests

```
✓ 6th login attempt within 15min returns 429
✓ Locked account returns 423 until lockedUntil passes
✓ Revoked session token returns 401
✓ Expired session token returns 401
✓ Valid token from different tenant returns 403
✓ Magic link token is single-use
✓ Password reset token expires after 1 hour
```

### 11.4 Safety Tests

```
✓ Entry with "quero morrer" sets flaggedForSupport=true
✓ Crisis card displayed to patient after flag
✓ Flag is logged in audit trail
✓ No automatic therapist notification (unless clinic enables)
✓ Crisis resources use tenant-configured text/phone
```

---

## 12. Production Readiness Checklist

```
[ ] Schema migration applied without data loss
[ ] All patient APIs enforce tenantId + patientId isolation
[ ] Journal PRIVATE entries are query-level filtered for therapists
[ ] Password hashing uses bcrypt cost 12
[ ] Session tokens stored as SHA-256 hashes only
[ ] Rate limiting on all auth endpoints
[ ] Audit logging on all patient mutations
[ ] Crisis keyword detection functional
[ ] Consent flow blocks access until accepted
[ ] Feature flags respect tenant configuration
[ ] Email templates render correctly
[ ] Mobile layout tested on iOS Safari + Android Chrome
[ ] Empty states for zero appointments/charges/entries
[ ] Error boundaries on all portal pages
[ ] CSP headers include portal routes
[ ] No clinical notes exposed in any patient API
[ ] No adminNotes exposed in appointment detail
[ ] Push notification previews contain no PHI
[ ] LGPD deletion request flow documented
[ ] Load test: 100 concurrent patient sessions
```

---

## 13. Revisit as System Grows

| Trigger | Action |
|---------|--------|
| >1000 concurrent patients | Consider Redis session store instead of DB |
| Push notifications needed | Add FCM/APNs integration, PatientDevice model |
| Pay-now integration | Add Stripe/PIX payment link to charge detail |
| Telehealth room | Embed Jitsi/Daily in session detail page |
| Multi-language | Extract all strings to i18n files |
| Mobile app | Extract API layer; portal becomes a thin PWA or React Native shell |
| HIPAA compliance | Add BAA, audit export, automatic session timeout (15min) |
