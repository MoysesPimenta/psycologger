# Psycologger — Development Roadmap

> **How to use this file**: This is the single source of truth for all pending work.
> When starting a coding session, read this file first to pick up exactly where we left off.
> Mark items `[x]` when complete. Add notes inline.
> Sections are ordered by priority. Within a phase, items are ordered by dependency.

---

## Current Status (as of 2026-03-28)

- ✅ Full stack deployed: Vercel + Supabase + Resend
- ✅ Auth working end-to-end: magic link → JWT → middleware → `/app/today`
- ✅ All 12 API routes audited and patched (multi-tenant routing, schema FK fixes)
- ✅ RBAC engine complete (5 roles, 40+ permissions)
- ✅ Prisma schema synced to Supabase
- ⏳ **Not yet tested with real users — beta not yet open**

---

## Phase 0 — Pre-Beta Blockers (Fix Before Any Real Users)

These are correctness/security issues that must be fixed before inviting even one user.

### P0-1: CPF Encryption [ ]
**File**: `src/app/api/v1/patients/route.ts` (POST) and `src/app/api/v1/patients/[id]/route.ts` (PATCH)
**Problem**: CPF is stored in plain text. The schema has `cpf String?` and `src/lib/crypto.ts` has `encrypt()`, but nobody calls it.
**Fix**:
```typescript
// In POST /patients, before db.patient.create:
const encryptedCpf = body.cpf ? await encrypt(body.cpf) : null;
// Then: cpf: encryptedCpf

// In PATCH /patients/[id], same treatment
// Add cpf field to createSchema and updateSchema in both route files
// When reading patient for display, decrypt: body.cpf = await decrypt(patient.cpf)
```
**Also needed**: Add `cpf` field to Zod schemas, add CPF input to `new-patient-client.tsx` and `patient-detail-client.tsx` UI.

### P0-2: ENCRYPTION_KEY Must Be Set in Vercel [ ]
**Problem**: If `ENCRYPTION_KEY` is not set, `encrypt()` throws at runtime when a CPF is saved.
**Fix**: Generate a key and add to Vercel env vars:
```bash
node -e "require('./src/lib/crypto').generateKey().then(console.log)"
```
Then add `ENCRYPTION_KEY=<output>` in Vercel → Settings → Environment Variables.
**Note**: Also document this in `.env.example` so it's never forgotten.

### P0-3: AppointmentType Seed Data Required [ ]
**Problem**: Creating an appointment requires `appointmentTypeId` (UUID, not nullable). The DB is empty — no appointment types exist. The UI calendar will crash trying to render/create appointments.
**Fix**: Create a database seed or a one-time migration that inserts default appointment types per tenant.
**Options**:
- A) Add to `prisma/seed.ts` to insert defaults for each existing tenant (run once manually)
- B) Auto-create a default AppointmentType when a tenant is created (in the onboarding transaction in `src/app/api/v1/onboarding/route.ts`)
- C) Add an AppointmentType CRUD API + UI page so clinic admins can manage them

**Recommended**: Do B (auto-create on onboarding) + C (CRUD UI). B is blocking, C is Phase 1.

**Immediate fix for B** — add to the `db.$transaction` in `src/app/api/v1/onboarding/route.ts`:
```typescript
await tx.appointmentType.create({
  data: {
    tenantId: tenant.id,
    name: "Consulta",
    sessionType: "IN_PERSON",
    defaultDurationMin: 50,
    defaultPriceCents: 0,
    color: "#3b82f6",
    isActive: true,
  },
});
```

### P0-4: Slug Collision in Onboarding [ ]
**File**: `src/lib/utils.ts` (generateSlug), `src/app/api/v1/onboarding/route.ts`
**Problem**: If "Clínica São Paulo" and "Clinica Sao Paulo" both sign up, they get the same slug → DB unique constraint error → 500 to user.
**Fix**: Add collision retry logic in onboarding:
```typescript
async function findUniqueSlug(tx: PrismaTx, base: string): Promise<string> {
  let slug = generateSlug(base);
  let attempt = 0;
  while (await tx.tenant.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${generateSlug(base)}-${attempt}`;
  }
  return slug;
}
```

### P0-5: Fix TypeScript `as never` Cast in TodayClient [ ]
**File**: `src/app/app/today/page.tsx` line ~75: `appointments={appointments as never}`
**Problem**: This suppresses type errors and hides potential bugs. The real fix is to ensure the `appointments` type from Prisma matches `Appointment[]` in `today-client.tsx`.
**Fix**: Export the interface from `today-client.tsx` and import it in `today/page.tsx`, or use a `satisfies` operator.

### P0-6: Reports CSV Missing Patient Names [ ]
**File**: `src/app/api/v1/reports/route.ts`
**Problem**: The CSV export includes `patientId` (UUID) instead of the patient's name. Useless for accountants.
**Fix**: Include the patient relation in the query and use `charge.patient.fullName` in the CSV row.

### P0-7: Onboarding Page Redirect Loop Risk [ ]
**File**: `src/app/onboarding/page.tsx`
**Problem**: The page redirects to `/signup` if the user has no membership, but `/signup` is the public landing page for creating a new account — not a "you need to join a clinic" page. This creates a confusing UX.
**Fix**: Create a proper "You're not part of any clinic yet" UI at `/onboarding` instead of blindly redirecting. Show options: "Create a clinic" or "Wait for an invite".

---

## Phase 1 — Beta MVP (Core Loop Fully Working)

Everything in this phase must be done before opening beta to real psychologists.

### P1-1: AppointmentType CRUD API + UI Page [ ]
**New file**: `src/app/api/v1/appointment-types/route.ts` (GET, POST)
**New file**: `src/app/api/v1/appointment-types/[id]/route.ts` (GET, PATCH, DELETE)
**New page**: `src/app/app/settings/appointment-types/page.tsx`
**New component**: `src/components/settings/appointment-types-client.tsx`
**Schema**: Already exists — `AppointmentType` model in Prisma.
**Permissions**: `tenant:edit` to create/edit, `appointments:view` to list.

Fields to expose:
- name (string)
- sessionType (IN_PERSON | ONLINE | EVALUATION | GROUP)
- defaultDurationMin (5–480)
- defaultPriceCents (int)
- color (hex color picker)
- isActive (toggle)

### P1-2: Tenant Switcher UI [ ]
**Problem**: Users with multiple clinic memberships (e.g. a psychologist at 2 clinics) have no way to switch tenants in the UI.
**Current state**: `getUserMemberships()` in `src/lib/tenant.ts` already exists.
**Fix**: Add a switcher to `src/components/shell/app-sidebar.tsx`:
- Display current tenant name in the sidebar header
- Clicking it opens a dropdown listing all active memberships
- Selecting one sets the `psycologger-tenant` cookie to the new tenantId and refreshes
- Add a `PATCH /api/v1/session/tenant` route (or just use a server action) that sets the cookie.

### P1-3: Settings Page Completeness [ ]
**File**: `src/app/app/settings/page.tsx` and the settings client component
**Current state**: Settings API (GET/PATCH) is complete, but the UI likely only exposes a subset of fields.
**Fields to ensure are editable in UI**:
- Clinic name, timezone, locale
- Working hours (start/end/days)
- sharedPatientPool toggle
- adminCanViewClinical toggle
- calendarShowPatient selector
- defaultAppointmentDurationMin
- Contact info (phone, website, address)

### P1-4: Overdue Charges Auto-Update Cron Job [ ]
**Problem**: Charges past their due date stay as `PENDING` forever unless manually updated. `OVERDUE` status never gets set automatically.
**Fix**: Create a scheduled job (Vercel Cron or a POST endpoint with secret key) that runs daily:
```typescript
// POST /api/cron/mark-overdue (protected by CRON_SECRET header)
await db.charge.updateMany({
  where: {
    status: "PENDING",
    dueDate: { lt: startOfToday() },
  },
  data: { status: "OVERDUE" },
});
```
Add to `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/mark-overdue", "schedule": "0 6 * * *" }]
}
```
**New files**: `src/app/api/cron/mark-overdue/route.ts`, `vercel.json`

### P1-5: Appointment Reminder Cron Job [ ]
**Problem**: The `sendAppointmentReminder` and `sendAppointmentConfirmation` email functions exist in `src/lib/email.ts` but are never called automatically.
**Fix**: Create a daily cron job that:
1. Finds appointments starting in the next 24h that haven't had a `REMINDER_24H` log
2. Calls `sendAppointmentReminder()` for each patient with an email
3. Creates a `ReminderLog` record
```typescript
// POST /api/cron/send-reminders
const tomorrow = addDays(startOfDay(new Date()), 1);
const dayAfter = addDays(tomorrow, 1);
const appointments = await db.appointment.findMany({
  where: {
    startsAt: { gte: tomorrow, lt: dayAfter },
    status: { in: ["SCHEDULED", "CONFIRMED"] },
    patient: { email: { not: null } },
    reminderLogs: { none: { type: "REMINDER_24H" } },
  },
  include: {
    patient: { select: { fullName: true, email: true } },
    appointmentType: true,
    tenant: { select: { name: true, timezone: true } },
  },
});
// ... send + log each
```
**New file**: `src/app/api/cron/send-reminders/route.ts`

### P1-6: CPF Display / Decrypt in Patient Detail [ ]
Once P0-1 (encryption) is done, the patient detail page needs to decrypt and display the CPF (masked by default, visible on click for authorized roles).
**File**: `src/components/patients/patient-detail-client.tsx`
**Implementation**: Server component fetches patient → decrypts CPF server-side → passes masked version to client. Add "Reveal" button that calls a server action or API endpoint.

### P1-7: Improved Onboarding UX [ ]
See P0-7. Create proper `/onboarding` page with:
- "Create my clinic" form (currently handled by the public signup, which is confusing)
- Pending invite notice (if the user was invited but hasn't completed yet)

### P1-8: Calendar Feature Completeness [ ]
**File**: `src/components/appointments/calendar-client.tsx`
**Check**: Ensure react-big-calendar is properly integrated with:
- Drag-to-create new appointment (opens modal)
- Click existing appointment (opens detail drawer)
- Week/day/month view toggle
- Color-coded by AppointmentType
- Working hours highlighted (from tenant settings)
- Proper timezone handling

### P1-9: Super Admin Dashboard [ ]
**File**: `src/app/sa/dashboard/page.tsx`
**Currently**: Likely a stub.
**Needs**: List all tenants, total users, recent signups, ability to impersonate a tenant.

---

## Phase 2 — Production Features

### P2-1: File Upload System [ ]
**Problem**: `FileObject` model exists but there are no upload/download endpoints.
**Stack**: Vercel Blob or AWS S3/Cloudflare R2.
**New files**:
- `src/app/api/v1/files/route.ts` (GET list, POST presigned upload URL)
- `src/app/api/v1/files/[id]/route.ts` (GET download URL, DELETE)
**Security**: Files tagged `isClinical: true` require `files:downloadClinical` permission to access.

### P2-2: Session Note Encryption at Rest [ ]
**Problem**: `ClinicalSession.isEncrypted` flag exists but `noteText` is never encrypted.
**Fix**: On `sessions:create` and `sessions:edit`, if tenant has `encryptNotes: true` setting:
```typescript
const encryptedNote = await encrypt(body.noteText);
await db.clinicalSession.create({ data: { noteText: encryptedNote, isEncrypted: true } });
```
On read: if `isEncrypted`, decrypt before returning.
**Schema change needed**: Add `encryptNotes Boolean @default(false)` to `Tenant` model.

### P2-3: Google Calendar Sync [ ]
**Model**: `GoogleCalendarToken` exists.
**Needs**:
- OAuth2 flow: `GET /api/auth/google-calendar/connect` → Google OAuth → callback stores encrypted tokens
- Sync on appointment create/update/cancel: `src/lib/google-calendar.ts` service
- UI toggle in settings page

### P2-4: NFSe Integration [ ]
**Model**: `NfseInvoice` and `IntegrationCredential` exist.
**Needs**:
- Provider adapter pattern: `src/lib/nfse/index.ts` (eNotas, Focus NFe, or Elysia)
- UI to configure credentials in settings
- "Emitir NFS-e" button on a paid charge

### P2-5: Patient Consent Management UI [ ]
**Schema supports**: `consentGiven`, `consentGivenAt`, `consentFileId`.
**Needs**: UI to record consent date and optionally upload consent document.

### P2-6: Appointment Recurrence (Series Edit) [ ]
**Problem**: Recurrence model exists, appointments can be created with `recurrenceRrule`, but there's no way to edit/cancel a series.
**Fix**: Add `PATCH /api/v1/appointments/[id]?scope=series|future|single` endpoint logic.

### P2-7: Patient Import CSV [ ]
Allow clinic admins to bulk-import patients from CSV. UI in patients page.
**Endpoint**: `POST /api/v1/patients/import`

### P2-8: Reports — More Types [ ]
Current reports only support `monthly` aggregate. Add:
- `by-patient`: charges + sessions per patient
- `by-provider`: revenue per psychologist
- `attendance`: no-show rates, cancellation rates

---

## Phase 3 — Production Hardening

### P3-1: Upstash Redis Rate Limiting [ ]
**File**: `src/lib/api.ts` — replace the in-memory `Map` with Upstash Redis.
The in-memory map is per-instance and resets on every Vercel deploy/cold start. Not effective in production.
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(10, "10 s") });
```
**Add env vars**: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

### P3-2: Error Monitoring (Sentry) [ ]
Add `@sentry/nextjs`. Wrap unhandled API errors. Monitor frontend crashes.

### P3-3: Structured Logging [ ]
Replace `console.error("[api] ...")` with a structured logger (Pino or Axiom).

### P3-4: Database Query Optimization [ ]
- Review all `findMany` calls without explicit `take` limits
- Add cursor-based pagination for large patient/appointment lists
- Consider read replicas once traffic grows

### P3-5: Security Headers Review [ ]
Ensure `next.config.ts` includes all CSP headers. Audit for XSS/clickjacking exposure.

### P3-6: LGPD Compliance (Brazilian GDPR) [ ]
- Data retention policy (how long to keep deleted patient data)
- Right to erasure endpoint: `DELETE /api/v1/patients/[id]/erase` (hard delete + audit log)
- Privacy policy page
- Cookie consent banner

### P3-7: Subscription / Billing [ ]
Currently all tenants are on `plan: "beta"`. Eventually:
- Integrate Stripe or Pagar.me
- Enforce plan limits (patient count, user count)
- Billing portal page

---

## Testing Strategy

> **IMPORTANT**: Tests are to be written and run AFTER we confirm the app is working
> end-to-end with real users and the flow is stable. Tests lock in correct behavior.
> See `tests/` directory for implementation (to be created in Phase 0 cleanup).

### What to test and where
- `tests/unit/rbac.test.ts` — all RBAC `can()` edge cases
- `tests/unit/crypto.test.ts` — encrypt/decrypt round-trips, key validation
- `tests/unit/api-utils.test.ts` — pagination, error shapes, rate limiting
- `tests/unit/utils.test.ts` — formatDate, formatCurrency, generateSlug
- `tests/integration/patients-api.test.ts` — full CRUD with mocked DB
- `tests/integration/appointments-api.test.ts` — create, conflict detection, status updates
- `tests/integration/payments-api.test.ts` — create payment, auto-mark charge as PAID
- `tests/integration/invite-flow.test.ts` — invite creation, acceptance, membership creation
- `tests/integration/onboarding.test.ts` — signup, tenant+user+membership transaction
- `tests/e2e/auth.spec.ts` — login flow (Playwright)
- `tests/e2e/patient-crud.spec.ts` — create/edit/view patient
- `tests/e2e/appointment-flow.spec.ts` — book appointment → complete → log session → create charge → record payment
- `tests/e2e/invite.spec.ts` — invite user → accept → login

---

## Environment Variables Checklist

All of these must be set in Vercel (Production + Preview):

| Variable | Purpose | Status |
|---|---|---|
| `DATABASE_URL` | Supabase Transaction Pooler (port 6543) | ✅ Set |
| `DIRECT_URL` | Supabase Direct (port 5432, for migrations) | ✅ Set |
| `NEXTAUTH_SECRET` | JWT signing | ✅ Set |
| `NEXTAUTH_URL` | App base URL | ✅ Set |
| `RESEND_API_KEY` | Magic link + notification emails | ✅ Set |
| `EMAIL_FROM` | Sender address (must be verified domain in Resend) | ❓ Verify |
| `ENCRYPTION_KEY` | CPF + credential encryption (32-byte base64) | ❌ Not yet set |
| `CRON_SECRET` | Protect cron endpoints from unauthorized calls | ❌ Not yet set |
| `UPSTASH_REDIS_REST_URL` | Rate limiting (Phase 3) | ❌ Future |
| `UPSTASH_REDIS_REST_TOKEN` | Rate limiting (Phase 3) | ❌ Future |

---

## Known TypeScript Issues

1. `appointments as never` in `src/app/app/today/page.tsx:75` — type cast needs proper fix (P0-5)
2. `status: status as never` in `src/app/api/v1/appointments/route.ts:50` — AppointmentStatus enum cast
3. `status: status as never` in `src/app/api/v1/charges/route.ts` — ChargeStatus enum cast
4. These `as never` casts work at runtime but hide potential type bugs — fix with proper Zod enums on query params

---

## Git Workflow Convention

- Branch naming: `fix/<short-description>` | `feat/<short-description>` | `chore/<short-description>`
- Commit after every logically complete change (not every file save)
- Always run `npm run typecheck && npm run lint` before committing
- PRs should reference the phase item (e.g. "Fixes P0-1 CPF encryption")

---

## Session Continuity Notes

To resume work in a new session:
1. Read this file (`ROADMAP.md`) to see current status
2. Read `Psycologger_Audit_Report.docx` for architecture overview
3. The most important files to understand are:
   - `src/lib/auth.ts` — NextAuth JWT config
   - `src/lib/tenant.ts` — `getAuthContext()`
   - `src/lib/rbac.ts` — `can()` permission engine
   - `src/middleware.ts` — Edge auth guard + tenant header injection
   - `prisma/schema.prisma` — Full data model
4. All API routes follow the same pattern: `getAuthContext(req)` → `requirePermission()` → Zod parse → DB query → `auditLog()` → return `ok()`/`created()`
