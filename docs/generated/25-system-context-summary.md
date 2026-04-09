# Psycologger — System Context for AI Development

## Identity

Psycologger is a multi-tenant SaaS platform for Brazilian psychologists, built on Next.js 14 with Prisma/Supabase PostgreSQL, providing appointment scheduling, clinical session management, charges/payments, and secure patient portals with encryption and audit logging.

## Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase PostgreSQL via Prisma ORM
- **Authentication:** NextAuth v4 (JWT) for staff + PatientAuth (PBKDF2 + magic links) for patient portal
- **Email:** Resend
- **Storage:** AWS S3 / Cloudflare R2
- **Encryption:** AES-256-GCM with key rotation
- **Deployment:** Vercel (gru1 region)
- **Internationalization:** next-intl with pt-BR (default), en, es locales
- **Status:** Pre-beta

## Architecture

Requests flow through Next.js App Router → middleware enforces auth and tenant context → API routes/Server Actions apply RBAC via `getCurrentUser()` and `ensurePermission()` → Prisma queries scoped to tenant. Multi-tenancy is enforced at middleware and query level (all queries filter by `tenantId`). Dual authentication: NextAuth handles staff accounts (SUPERADMIN, TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY); PatientAuth provides passwordless access to patient portal via magic links. Session data, appointments, charges, and clinical notes are encrypted in database; audit logs track 49 actions with PHI redaction.

## Roles & Permissions

| Role | Can Do | Cannot Do | Scope |
|------|--------|-----------|-------|
| SUPERADMIN | Everything: all tenants, all data, all settings | Nothing | Global (all tenants) |
| TENANT_ADMIN | Tenant settings, staff management, read all clinical (if enabled), patient CRUD, appointments | Create other tenants, change billing | Single tenant |
| PSYCHOLOGIST | Own patients, sessions, charges, prescriptions, read notes | Manage staff, view other psychologists' patients (unless portal) | Assigned patients only |
| ASSISTANT | Manage patient scheduling, read basic info, no clinical access | Create/edit sessions, view notes, approve charges | Assigned patients only |
| READONLY | View all data as read-only | Any write action | Single tenant |
| PATIENT (Portal) | View own appointments, charges, journal; cancel appointments; manage consents; update notifications | Access other patient data, clinical notes (unless shared) | Self only |

## Data Model (Key Entities)

- **Tenant** — Multi-tenant boundary, billing settings, feature flags — `id`, `slug`, `name`, `adminCanViewClinical`, `portalJournalEnabled`, `portalRescheduleEnabled` — owns all child entities
- **User** — Staff account, role, tenant assignment — `email`, `role`, `tenantId` — NextAuth subject
- **PatientProfile** — Patient record, linked to User for portal — `name`, `cpf`, `dateOfBirth`, `phone`, `encryptedMedicalHistory` — many Appointments, Sessions, Charges
- **Appointment** — Recurring/single appointment with timezone support, calendar sync — `startTime`, `endTime`, `recurrenceRule`, `timezone`, `status`, `psychologistId`, `patientId` — has SessionRecord
- **SessionRecord** — Clinical documentation in SOAP/BIRP/FREE format — `type`, `template`, `notes` (encrypted), `psychologistId`, `appointmentId` — one per Appointment
- **Charge** — Invoice line item, supports partial payment — `amount`, `dueDate`, `status`, `appointmentId`, `patientId` — many PaymentRecords
- **PaymentRecord** — Single payment application to Charge, tracks remainder — `amount`, `date`, `chargeId` — aggregates to Charge.totalPaid
- **Journal** — Patient portal self-reflection, encrypted — `title`, `content` (encrypted), `mood`, `timestamp`, `patientId` — CrisisDetection analyzes for risk
- **PatientConsent** — LGPD/audit consent records — `type`, `givenAt`, `expiresAt`, `patientId` — enables portal and data processing
- **AuditLog** — Action tracking with PHI redaction — `action`, `userId`, `tenantId`, `targetId`, `changes` (redacted), `createdAt` — 49 action types tracked
- **SessionFile** — Document uploaded to session, stored in R2 — `key`, `originalName`, `mimeType`, `encryptedMetadata`, `sessionRecordId` — magic byte validated
- **EmailReminder** — Queued appointment/charge reminder — `status`, `sendAt`, `patientId`, `appointmentId` — Vercel cron trigger
- **EncryptionKeyRotation** — Historical encryption keys for decryption — `encryptedKey`, `createdAt`, `version` — allows key rotation without data loss
- **NotificationPreference** — Patient notification settings — `emailReminders`, `appointmentReminders`, `journalPrompts`, `patientId` — controls outbound email

## Route Protection Rules

- **Public routes:** `/(auth)/*`, `/patient/login` — no auth required
- **Staff routes:** `/app/*` — require NextAuth session + valid role + tenant context via middleware
- **Patient portal:** `/patient/portal/*` — require PatientAuth session (magic link) + consent verification
- **API routes:** `/api/*` — enforce RBAC via `getCurrentUser()` and `ensurePermission()` before DB queries
- **Sensitive endpoints:** `/api/admin/*`, `/api/encryption/*` — SUPERADMIN only, verified via middleware

## Critical Business Rules

1. **Tenant isolation:** All queries must filter by `tenantId`; no cross-tenant data leakage
2. **RBAC enforcement:** Every mutation requires `ensurePermission()` check before Prisma call
3. **Appointment timezone:** stored in UTC, displayed in `Appointment.timezone`; recurring rules respect timezone
4. **Clinical note encryption:** `SessionRecord.notes` must be encrypted before write, decrypted on read (AES-256-GCM)
5. **Partial payment:** `Charge` splits into paid + remainder; `PaymentRecord` tracks individual payments; do not delete remainder Charges
6. **Patient portal access:** requires `PatientConsent` with `type=PORTAL_ACCESS` and within `expiresAt`
7. **Journal encryption:** `Journal.content` always encrypted; never log plaintext
8. **Session file validation:** all uploads must pass magic byte validation; R2 key namespaced by `tenantId`
9. **Audit logging:** every action in `AUDITABLE_ACTIONS` must create `AuditLog` with PHI redaction (CPF, medical notes omitted)
10. **Email reminders:** Vercel cron triggers `/api/cron/payment-reminders` daily; Resend failures retried
11. **Encryption key rotation:** new version created, all new encrypts use new key; old keys retained for decryption
12. **CSRF protection:** double-submit cookies on state-changing routes; NextAuth handles session CSRF
13. **Rate limiting:** Upstash Redis limits staff login (5/minute), patient login (3/minute), file upload (10/minute/user)
14. **CSP nonces:** generated per request for inline scripts; stored in request context
15. **Psychologist scope:** cannot see other psychologists' patients/sessions/charges unless they are TENANT_ADMIN with `adminCanViewClinical=true`

## Security Invariants

1. **ENCRYPTION_KEY must be set** at startup; validation runs on app boot
2. **CPF encrypted at rest** with AES-256-GCM (`enc:v1:` prefix) + HMAC-SHA256 blind index for searchable encryption (as of 2026-04-07)
3. **Medical history encrypted** as `PatientProfile.encryptedMedicalHistory` using `encryptData()`
4. **Session notes encrypted** with AES-256-GCM (`enc:v1:` prefix); plaintext rejection available via `CLINICAL_NOTES_REJECT_PLAINTEXT=1` (as of 2026-04-07)
5. **Journal content encrypted** as `Journal.content` using `encryptData()`
6. **All file uploads** validated via magic bytes before storage; no arbitrary extensions allowed
7. **Audit logs redact PHI** — CPF, medical notes, session contents omitted in `changes` field
8. **Session/Patient/Charge deletion** cascades only via soft-delete patterns; no hard deletes without SUPERADMIN override
9. **Password reset** only via Resend email for NextAuth users; patients use magic links
10. **LGPD compliance** — consent records logged; data subject deletion via audit trail (not yet automated)

## API Pattern

```typescript
// Standard API route pattern
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, ensurePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensurePermission(user, 'resource:action'); // e.g. 'sessions:create'

    const body = await req.json();
    // Validate input
    // Query filtered by tenantId
    const result = await prisma.resource.create({
      data: { ...body, tenantId: user.tenantId },
    });

    // Audit log if needed
    if (AUDITABLE_ACTIONS.includes('resource:create')) {
      await auditLog(user, 'resource:create', result.id, { created: true });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

## Current State

**Works:**
- Multi-tenant auth (staff + patient portal)
- RBAC with 5 roles and 27 permissions
- Appointment scheduling with recurring rules and timezone support
- Clinical session templates (SOAP, BIRP, FREE)
- Charge and partial payment tracking
- Patient portal with journal and encryption
- Audit logging with 49 actions
- Email reminders (Vercel cron)
- File upload with magic byte validation
- Encryption and key rotation
- Internationalization (next-intl with pt-BR, en, es locales; getTranslations() in use across dashboard pages)
- Google Calendar sync (OAuth2 flow, token storage, event sync; endpoints at `/api/v1/calendar/callback` and `/api/v1/calendar/disconnect`)
- NFSe integration (PlugNotas adapter with credential CRUD, issue/cancel/status-check endpoints; routes at `/api/v1/nfse/*`)
- LGPD DSAR (patient data export, deletion, anonymization via `/api/v1/patients/[id]/dsar/*`; tenant purge automation at `/api/v1/cron/lgpd-purge`)
- Health check endpoint (`/api/v1/health` and `/api/health`)

**Stubs/Incomplete:**

**Missing:**
- (CPF blind-index is now LANDED — `Patient.cpfBlindIndex` HMAC-SHA256 column + `(tenantId, cpfBlindIndex)` index exist; wired into patients POST/PATCH and the GET search via `isCpfShapedQuery`. Migration: `prisma/migrations/20260407_cpf_blind_index/`. The encrypt-cpfs cron backfills both encryption and blind index in one pass.)
- Appointment reminder cron registered in vercel.json (route exists at `/api/v1/cron/appointment-reminders` and is registered)

**Verified working (commonly-misreported):**
- Clinical notes ARE encrypted: `ClinicalSession.noteText` and `SessionRevision.noteText` go through `encryptNote()` (sentinel `enc:v1:` + AES-256-GCM) on every write path; `decryptNote()` is called on every read; backfill cron at `/api/v1/cron/encrypt-clinical-notes` handles legacy plaintext
- `x-tenant-id` header is unconditionally stripped in middleware before re-injection from the cookie
- Magic-link tokens are stored as SHA-256 hashes (`hashLinkToken`), only the hash lives in DB
- CSRF tokens rotate on auth callback / signOut / portal auth
- Charge POST + PATCH already enforce `providerUserId` scope for PSYCHOLOGIST role (PATCH uses `updateMany` with the scope filter on the write to prevent race-window escapes)
- Journal-inbox trends already verifies `assignedUserId` before querying
- SWR for real-time appointment sync
- Load testing and capacity planning
- Staging environment (only localhost and production)
- Rate limit monitoring dashboard
- Appointment reminder email workflow

## Known Gaps (Prioritized)

1. ~~CPF plaintext in database~~ — RESOLVED 2026-04-07: AES-GCM ciphertext + HMAC-SHA256 blind index landed; backfill cron deployed
2. ~~SessionRecord.notes unencrypted~~ — RESOLVED earlier: `enc:v1:` sentinel + AES-256-GCM, backfill cron at `/api/v1/cron/encrypt-clinical-notes`
3. ~~i18n framework~~ — RESOLVED 2026-04-09: next-intl integrated with pt-BR, en, es locales; active in dashboard pages
4. ~~Google Calendar sync stub~~ — RESOLVED 2026-04-09: OAuth2 flow, token storage, event sync implemented
5. ~~NFSe integration stub~~ — RESOLVED 2026-04-09: PlugNotas adapter with credential CRUD and status check
6. ~~Appointment reminder cron missing~~ — RESOLVED 2026-04-09: registered in vercel.json at `/api/v1/cron/appointment-reminders`
7. ~~LGPD data deletion not automated~~ — RESOLVED 2026-04-09: DSAR endpoints (export, delete, anonymize) + tenant purge cron implemented
8. **No staging environment** — cannot test pre-release changes safely
9. **Rate limiting may be ineffective** — Upstash Redis optional; in-memory fallback not production-safe
10. **No load testing visible** — capacity unknown; no performance baselines

## File Map (What to Read First)

| File | Purpose |
|------|---------|
| `/lib/auth.ts` | `getCurrentUser()`, `ensurePermission()`, role/permission definitions |
| `/lib/db.ts` | Prisma client setup, tenant context filtering middleware |
| `prisma/schema.prisma` | All 30+ data models, relationships, constraints |
| `/app/api/middleware.ts` | Auth middleware, tenant resolution, CSP nonce generation |
| `/app/api/sessions/route.ts` | Session CRUD with encryption, audit logging pattern |
| `/app/api/appointments/route.ts` | Appointment recurring rules, timezone logic |
| `/lib/encryption.ts` | AES-256-GCM encrypt/decrypt, key rotation |
| `/app/patient/portal/page.tsx` | Patient portal UI, journal, consent management |
| `/lib/audit.ts` | Audit log creation, PHI redaction rules |
| `/app/api/cron/payment-reminders.ts` | Vercel cron trigger, Resend email dispatch |

## Dangerous Areas

1. **`prisma/schema.prisma`** — changing relationships without migration planning causes data loss; test migrations locally first
2. **`/lib/encryption.ts`** — modifying cipher mode, key size, or salt length breaks all encrypted data; versioning is critical
3. **`/lib/auth.ts`** — role/permission changes must be audited; removing permissions without migration causes downtime
4. **`/app/api/middleware.ts`** — tenant isolation logic; any bypass enables cross-tenant data leakage
5. **`app/api/cron/payment-reminders.ts`** — Vercel cron configuration in `vercel.json`; changes require redeployment and verification

---

**Last verified against code:** 2026-04-09
- i18n (next-intl) with pt-BR, en, es locales live
- Google Calendar sync with OAuth2 flow live
- NFSe integration with PlugNotas adapter live
- LGPD DSAR (export, delete, anonymize) + tenant purge cron live
- Health check endpoints (`/api/v1/health` and `/api/health`) verified
- CPF encryption with blind index verified
- Clinical notes encryption with production rejection option verified

## April 2026 update — plan-limit enforcement & SA console

- `src/lib/billing/limits.ts` is the canonical plan-entitlement module. Exports
  `QuotaExceededError`, `countActivePatients` (filters on `isActive=true`, **not**
  90-day activity), `countPatientsWithRecentActivity` (engagement metric only),
  `countTherapistSeats`, `assertCanAddPatient`, `assertCanAddTherapist`,
  `getTenantQuotaUsage`. Plans whose cap is `Infinity` short-circuit without DB
  queries.
- Quota is enforced in: `POST /api/v1/patients`, `PATCH /api/v1/patients/[id]`
  (reactivation `isActive:false→true`), `POST /api/v1/users` (invite create for
  PSYCHOLOGIST/ASSISTANT), `POST /api/v1/invites/[token]` (invite accept).
- `QuotaExceededError` is mapped in `src/lib/api.ts` to HTTP 402 with body
  `{code:"QUOTA_EXCEEDED", resource, current, limit, planTier}`.
- New SA ops routes under `/api/v1/sa/tenants/[id]/`: `suspend`, `reactivate`,
  `plan-override`, `notes` (GET/POST). All require `requireSuperAdmin()`.
- New audit actions: `BILLING_SUBSCRIPTION_CREATED`, `BILLING_SUBSCRIPTION_CANCELED`,
  `BILLING_SUBSCRIPTION_REACTIVATED`, `BILLING_TRIAL_CONVERTED`,
  `BILLING_WEBHOOK_FAILED`, `SA_TENANT_SUSPEND`, `SA_TENANT_REACTIVATE`,
  `SA_PLAN_OVERRIDE`, `SA_INTERNAL_NOTE`. Internal notes live in `AuditLog`,
  no new table.
- Stripe webhook (`src/app/api/v1/webhooks/stripe/route.ts`) now emits lifecycle
  events alongside a legacy `BILLING_STATE_CHANGED` mirror so sa-metrics can
  reconstruct history from `entityId = tenant.id`.
- `src/lib/sa-metrics.ts` rewrite: full `SaasMetrics` interface (MRR/ARR/ARPA/
  churn/LTV/movements/webhook errors/over-quota count) plus
  `computeHistoricalSeries(months)` for the 12-month MRR sparkline on `/sa/metrics`.
- New page `/sa/quota-audit` lists historical over-quota tenants.
- Tenant detail page bug fixed: was reading legacy `tenant.plan` string; now
  uses `tenant.planTier`.
- Pricing source of truth `src/lib/billing/plans.ts`: FREE R$0 (3 pat / 1 seat),
  PRO R$99 (25 pat / 1 seat), CLINIC R$199 (Infinity pat / 5 seats).
- Unit tests: `tests/unit/billing-limits.test.ts` covers the enforcement
  invariants via a `jest.mock("@/lib/db", …)` pure-unit pattern.

### April 8, 2026 — Support inbox (SA-only)

- New models: `SupportTicket`, `SupportMessage`, `SupportBlocklist` +
  enums `SupportTicketStatus` (OPEN/PENDING/CLOSED),
  `SupportMessageDirection` (INBOUND/OUTBOUND), `SupportBlocklistKind`
  (EMAIL/DOMAIN). Migration `20260408_support_inbox`.
- New webhook `POST /api/v1/webhooks/resend-inbound` (Svix-verified, nodejs
  runtime, CSRF/auth exempt via the existing `/api/v1/webhooks/*` allowlist).
  Encrypts body with `ENCRYPTION_KEY` (clinical-note helper), enforces a
  blocklist and rate limits (20/10min per fromEmail + 500/min global),
  best-effort tenant/user match by email, threads by normalized subject in
  a 14-day window.
- New SA routes: `POST /api/v1/sa/support/tickets/[id]/reply` (Resend send
  + threading headers + 60/hour per SA user), `POST …/status`, and
  `POST`/`DELETE /api/v1/sa/support/blocklist`.
- New pages: `/sa/support`, `/sa/support/[id]`, `/sa/support/blocklist`.
  Sidebar "Suporte".
- New audit actions: `SUPPORT_TICKET_CREATED`, `SUPPORT_MESSAGE_APPENDED`,
  `SUPPORT_TICKET_REPLIED`, `SUPPORT_TICKET_STATUS_CHANGED`,
  `SUPPORT_INBOUND_BLOCKED`, `SUPPORT_BLOCKLIST_ADDED`,
  `SUPPORT_BLOCKLIST_REMOVED`.
- Default outbound from: `Psycologger Suporte <support@psycologger.com>`,
  overridable via `SUPPORT_EMAIL_FROM`.
- Fix: `/sa/audit` crash on clinic/user filters with no matches (invalid
  `__no_match__` placeholder on `@db.Uuid` columns) — now uses the zero
  UUID. Stop-impersonation now redirects to `/sa/users`.
