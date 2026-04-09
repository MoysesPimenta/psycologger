# Psycologger — Known Unknowns & Ambiguities

This document tracks everything that is ambiguous, missing evidence, contradictory, or requiring manual verification. These items should be clarified with the team or investigated before making assumptions.

## Docs that need regeneration after 2026-04-09 sprint

The following generated docs are now partially stale relative to code and should be regenerated when the next doc-gen pass runs:

- **05-auth-and-rbac.md** — Login Attempt Rate Limiting section was hand-patched on 2026-04-07; the rest of the patient-portal sections (lockout, last-login, audit actions) need a full regen pass.
- **08-business-domains.md** — Add billing reconciliation cron (`/api/v1/cron/billing-reconcile`).
- **11-api-reference.md** — Add `/api/debug/sentry-test`, `/api/v1/cron/billing-reconcile`, `/api/v1/webhooks/resend`, `/api/v1/calendar/*`, `/api/v1/nfse/*`, `/api/v1/patients/[id]/dsar/*`, `/api/v1/cron/lgpd-purge`, `/api/v1/health`, `/api/health`.
- **16-integrations.md** — Add Google Calendar OAuth2 flow, NFSe (PlugNotas) integration, Resend webhook + Stripe reconciliation.
- **17-security-and-privacy.md** — RLS section already updated by hand; PWA + service-worker section should be added; i18n routing updates.
- **18-testing.md** — Stale; new Jest unit suites under `tests/unit/` and `.github/workflows/ci.yml` are not reflected.
- **20-tech-debt-and-known-issues.md** — Updated: i18n now implemented (remove from debt), `as never` casts resolved, appointment reminder cron confirmed (remove from unknowns); parked CSP-nonce branch still in backlog.

New runbooks live under `docs/runbooks/` (not auto-generated):
- `backup-restore-drill.md` — quarterly PITR drill
- `sentry-alerts.md` — alert rules to configure in Sentry UI
- `i18n-audit-2026-04-07.md` — i18n posture and recommendation


## Deployment & Infrastructure

### Vercel Cron Status in Production
- **Question:** Is the Vercel cron job actually running in production?
- **Evidence:** `vercel.json` configures cron via `crons` array; `/api/cron/payment-reminders` endpoint exists with logic to dispatch email reminders
- **Gap:** No visibility into actual cron execution history, failure logs, or email delivery statistics
- **Impact:** If cron fails silently, appointment reminders are not sent and charges go unpaid
- **Action needed:** Check Vercel dashboard for cron execution logs and recent runs

### Environment Variables in Vercel
- **Question:** Are all environment variables actually set in the Vercel production dashboard?
- **Evidence:** `DEPLOY_ENV_VARS.md` lists required vars (ENCRYPTION_KEY, DATABASE_URL, RESEND_API_KEY, etc.)
- **Gap:** No automation to verify vars are set; docs only reference the list, not actual Vercel configuration
- **Impact:** Missing ENCRYPTION_KEY or DATABASE_URL causes app to crash at startup
- **Action needed:** Cross-check `.env.example` against Vercel dashboard settings manually

### Upstash Redis Configuration
- **Question:** Is Upstash Redis actually connected in production?
- **Evidence:** Code references Redis for rate limiting; fallback to in-memory rate limiting exists if Redis is unavailable
- **Gap:** Rate limiting may be ineffective across serverless instances due to in-memory fallback
- **Impact:** If Redis is not set up, rate limiting is per-instance and can be bypassed by hitting different serverless functions
- **Action needed:** Verify `REDIS_URL` is set and test rate limit behavior under load

### Supabase Storage Buckets
- **Question:** Are the S3/R2 buckets created and configured?
- **Evidence:** Code references `"session-files"` bucket for SessionFile storage; file upload endpoints assume bucket exists
- **Gap:** No bucket creation automation or initialization script
- **Impact:** File upload API will fail if bucket does not exist
- **Action needed:** Verify R2 or S3 buckets are created and have correct CORS and permissions

### Database Backups
- **Question:** Are database backups automated and tested?
- **Evidence:** Supabase provides automated backups, but no backup verification process visible in codebase
- **Gap:** No restore testing or backup monitoring
- **Impact:** Backup may fail silently; recovery time unknown
- **Action needed:** Verify backup schedule and test restore procedure

## Encryption & Key Management

### ENCRYPTION_KEY Validation
- **Question:** Is ENCRYPTION_KEY actually set and validated?
- **Evidence:** Startup validation added recently; app panics if key is missing
- **Gap:** No indication that key rotation or key backup procedures are documented
- **Impact:** If key is lost, all encrypted data becomes unrecoverable
- **Action needed:** Document key storage, rotation schedule, and recovery procedure

### Encryption Key Rotation in Production
- **Question:** What happens when encryption key is rotated in production?
- **Evidence:** `EncryptionKeyRotation` model exists with versioning; old keys retained for decryption
- **Gap:** No runbook for key rotation; mechanics exist but workflow is undocumented
- **Impact:** If rotation is done incorrectly, new data may use wrong key or old data may become unreadable
- **Action needed:** Document and test key rotation procedure end-to-end

### Deterministic Encryption for CPF Search
- **Question:** How is CPF search performed if CPF is plaintext?
- **Evidence:** CPF stored plaintext in `PatientProfile.cpf`; search functionality uses exact match
- **Gap:** If CPF is moved to encrypted field later, deterministic encryption must be used for search compatibility
- **Impact:** Plaintext CPF is a compliance risk; encrypted CPF requires schema change and data migration
- **Action needed:** Design and implement CPF encryption with deterministic encryption for search

## Data & Compliance

### Production Tenant Count
- **Question:** How many tenants exist in production?
- **Evidence:** Seed script creates 1 demo tenant; no tenant creation logs visible
- **Gap:** No way to query tenant count or growth metrics
- **Impact:** Capacity planning is impossible without knowing user base
- **Action needed:** Add tenant metrics to monitoring dashboard


### Clinical Notes Encryption
- **Question:** Are `SessionRecord.notes` actually encrypted?
- **Evidence:** Code does not show encryption of session notes before storage; notes are flagged as sensitive
- **Gap:** Gap between stated security invariants (notes encrypted) and actual implementation (notes plaintext)
- **Impact:** Clinical notes readable in database; HIPAA/LGPD compliance risk
- **Action needed:** Add encryption to session note creation and decrypt on read

## Features & Integrations



### Patient Portal Adoption
- **Question:** Is the patient portal actually being used in production?
- **Evidence:** Portal feature complete with journal, consent management, appointment view, notification preferences
- **Gap:** No usage metrics or adoption data visible
- **Impact:** Portal may be unused; effort may be misaligned with actual patient needs
- **Action needed:** Gather portal usage analytics and patient feedback

## Code Quality & Architecture

### Prisma `as never` Type Casts
- **Question:** Why do multiple files use `as never` type casts?
- **Evidence:** Pattern appears in session creation, appointment handling, charge creation
- **Gap:** Unclear if this is a Prisma version issue, TypeScript strict mode issue, or intentional workaround
- **Impact:** Type safety may be compromised; future Prisma updates may break these casts
- **Action needed:** Investigate root cause and replace with proper type-safe pattern


### SWR for Real-Time Sync
- **Question:** Is SWR needed for appointment sync across tabs?
- **Evidence:** No SWR library integrated; Prisma query results cached at request level only
- **Gap:** Appointments modified in one browser tab may not reflect immediately in another tab
- **Impact:** Users may see stale appointment data; concurrent edits possible
- **Action needed:** Evaluate real-time sync requirements and add SWR if needed

### Libsodium Removal Status
- **Question:** Was libsodium fully cleaned after removal from package.json?
- **Evidence:** Removed from `package.json` but no confirmation of code cleanup
- **Gap:** May be dead code references or build artifacts remaining
- **Impact:** Potential security or dependency issues if old code is still present
- **Action needed:** Audit codebase for remaining libsodium references

## Performance & Scalability

### Load Testing & Capacity Planning
- **Question:** Has load testing been performed?
- **Evidence:** No load testing or capacity planning visible in codebase or docs
- **Gap:** Unknown capacity limits, scaling behavior, or bottlenecks
- **Impact:** Unexpected behavior under load; no SLO baselines
- **Action needed:** Perform load testing and document capacity limits

### Expected User Load
- **Question:** What is the expected user load (tenants, psychologists, patients, API RPS)?
- **Evidence:** No metrics or projections visible
- **Gap:** Impossible to capacity plan or design for growth
- **Impact:** Infrastructure may be under- or over-provisioned
- **Action needed:** Define user growth projections with product team

### Rate Limit Configuration
- **Question:** Are rate limits appropriate for actual user behavior?
- **Evidence:** Hardcoded limits (5/min login, 3/min patient login, 10/min file upload)
- **Gap:** No data on actual request patterns or burst behavior
- **Impact:** Limits may be too strict (blocking users) or too loose (allowing abuse)
- **Action needed:** Monitor actual usage patterns and adjust limits based on data

### N+1 Query Audit
- **Question:** Are there N+1 query issues in the codebase?
- **Evidence:** No query performance audit visible; some routes fetch Appointments then Charges in loops
- **Gap:** Potential performance degradation as data grows
- **Impact:** Slow API responses with large datasets
- **Action needed:** Audit all API routes for N+1 queries and optimize with batch loading or joins

## Testing & Staging

### Staging Environment
- **Question:** Is there a staging environment for pre-release testing?
- **Evidence:** Only `.env.example` references localhost and production; no staging config visible
- **Gap:** No safe place to test changes before production
- **Impact:** Changes deployed directly to production; risk of breaking changes
- **Action needed:** Set up staging environment with production-like data (anonymized)

### Test Coverage
- **Question:** What is the test coverage and critical path coverage?
- **Evidence:** No test files visible in generated docs
- **Gap:** Unclear which features have automated tests
- **Impact:** Risk of regression on untested features
- **Action needed:** Establish minimum test coverage requirements and add tests for critical paths

### Audit Log Review Process
- **Question:** Are audit logs reviewed regularly?
- **Evidence:** Audit logs exported as CSV; no alerting or monitoring visible
- **Gap:** No automation to detect suspicious activity
- **Impact:** Security incidents may go unnoticed
- **Action needed:** Set up audit log monitoring and alerting for anomalies

## Documentation & Runbooks

### Missing Runbooks
- **Question:** Are runbooks documented for operational procedures?
- **Evidence:** No runbooks visible in codebase
- **Gap:** Operational team may not know how to handle incidents (e.g., encryption key rotation, data deletion, cron failure)
- **Impact:** Slow incident response; inconsistent procedures
- **Action needed:** Document runbooks for: key rotation, data deletion (LGPD), cron debugging, customer onboarding, scaling

### Tenant Onboarding Procedure
- **Question:** What is the tenant onboarding procedure?
- **Evidence:** Seed script creates demo tenant; no onboarding workflow visible
- **Gap:** No clear process for self-serve tenant creation or manual admin onboarding
- **Impact:** Blocking new customers from signing up
- **Action needed:** Document or implement tenant self-service onboarding

### Email Delivery Monitoring
- **Question:** Is email delivery monitored and success rates tracked?
- **Evidence:** Resend configured for email delivery; no monitoring dashboard visible
- **Gap:** Undelivered emails may go unnoticed
- **Impact:** Reminders and notifications fail silently
- **Action needed:** Set up Resend webhook integration and monitor delivery metrics

## Parked & Blocked Work

### CSP Nonce Migration (feat/csp-nonce)
- **Status:** Parked pending architectural decision
- **Question:** Should Sentry remain in the application?
- **Evidence:** Branch attempted to remove `withSentryConfig` wrapper from next.config.mjs; also removed `/api/health` and `/api/v1/cron/` from public routes
- **Gap:** Sentry is actively initialized in src/instrumentation.ts and validated in src/lib/env-check.ts, but the config wrapper was removed — architectural mismatch
- **Impact:** Error tracking would be lost in production; health checks and cron jobs would fail
- **Action needed:** Decide whether to keep or remove Sentry. If keeping, restore wrapper. If removing, update instrumentation and env validation. See docs/decisions/csp-nonce-parked.md

## Summary of Critical Actions

| Area | Action | Priority |
|------|--------|----------|
| Deployment | Verify Vercel cron is running | Critical |
| Encryption | Document key rotation procedure | Critical |
| Security | Decide on Sentry retention and finalize CSP nonce migration | High |
| Testing | Set up staging environment | High |
| Operations | Create operational runbooks | High |
| Performance | Perform load testing | Medium |
| Monitoring | Add audit log alerting | Medium |
| Code | Audit for N+1 queries | Low |

## Resolved 2026-04-09 (Session 2)

- **Internationalization (i18n)**: RESOLVED — next-intl integrated with pt-BR, en, es locales. Active in dashboard pages using `getTranslations()` server-side. Message files at `messages/pt-BR.json`, `messages/en.json`, `messages/es.json`.
- **Google Calendar sync**: RESOLVED — OAuth2 flow implemented. Endpoints: `/api/v1/calendar/callback`, `/api/v1/calendar/disconnect`. Token storage and event sync working. See `src/lib/google-calendar.ts` and `src/lib/calendar-sync.ts`.
- **NFSe integration**: RESOLVED — PlugNotas adapter implemented. Endpoints: `/api/v1/nfse/issue`, `/api/v1/nfse/[id]`, `/api/v1/nfse/credentials`, `/api/v1/cron/nfse-status-check`. Credential CRUD + status check working. See `src/lib/nfse/plugnotas.ts`.
- **LGPD DSAR (Data Subject Access Requests)**: RESOLVED — patient data export, deletion, and anonymization. Endpoints: `/api/v1/patients/[id]/dsar/export`, `/api/v1/patients/[id]/dsar/delete`, `/api/v1/patients/[id]/dsar/anonymize`. See `src/lib/lgpd-dsar.ts`.
- **Tenant purge automation (LGPD)**: RESOLVED — cron job `/api/v1/cron/lgpd-purge` runs daily at 03:30 BRT. Purges tenant-scoped data 90 days after `subscriptionStatus = CANCELED`. Hard-delete wrapped in transaction; counts logged via audit entry.
- **Appointment reminder cron**: RESOLVED — registered in `vercel.json` at `/api/v1/cron/appointment-reminders`. Endpoint implemented and wired.
- **Health check endpoints**: RESOLVED — `/api/v1/health` and `/api/health` endpoints exist. Ready for monitoring integration.

## Resolved 2026-04-08

- **Support Inbox attachments**: was open. Now end-to-end:
  `SupportAttachment` table, encrypted-at-rest in private
  `support-attachments` Supabase bucket, ingest from Resend
  `/emails/receiving/{id}`, allowlist-based quarantine, SA-only
  decrypt endpoint with audit log. See `SUPPORT-INBOX.md`.
- **Stale PENDING tickets** never auto-closed: now handled by
  `/api/v1/cron/support-stale-pending` (7 days, daily at 05:00 UTC)
  with an automatic encrypted INTERNAL note explaining the closure
  and a `SUPPORT_TICKET_AUTO_CLOSED` audit event.
- **One Stop Shop badge semantics**: confirmed — fires when the
  customer replies within 3 days of an SA outbound (positive signal).
- **"Salvar e fechar" silently dropping the typed reply**: fixed —
  if the body is non-empty the action now dispatches as `send("CLOSED")`,
  so the email is delivered.
- **Per-user dark theme**: shipped for clinic + patient portal.
  Persisted on `User.themePreference` / `Patient.themePreference` and
  in a `psy-theme` cookie; SSR + no-flash inline script avoid theme
  flicker. `ThemeSync` reconciles cross-device.

## Resolved 2026-04-09

- **Clinical notes encryption**: Confirmed working — `SessionRecord.notes` encrypted with `enc:v1:` sentinel + AES-256-GCM; decrypted on read; plaintext rejection optional via `CLINICAL_NOTES_REJECT_PLAINTEXT=1` flag; backfill cron at `/api/v1/cron/encrypt-clinical-notes` deployed.
- **CPF encryption + blind indexing**: Confirmed working — CPF stored as AES-256-GCM ciphertext + HMAC-SHA256 blind index on `(tenantId, cpfBlindIndex)`; migration `20260407_cpf_blind_index` deployed; backfill cron completed.
- **Appointment reminder cron**: Confirmed working — registered in `vercel.json` at `/api/v1/cron/appointment-reminders`.
- **Mobile bearer token foundation**: Implemented — JWT (HS256) tokens with 30-day TTL, feature-flagged via `MOBILE_BEARER_ENABLED=true`, fallback to NextAuth/portal sessions, `src/lib/bearer-auth.ts` + mobile token endpoints at `/api/v1/auth/mobile-token` and `/api/v1/portal/auth/mobile-token`.
- **Error & loading boundaries**: Deployed across `/app/*`, `/sa/*`, `/portal/*`, `/login/*` segments with minimal skeletons and error recovery.
- **Mobile readiness guide**: Complete — covers API envelope, token lifecycle, mobile-ready endpoints, recommended Expo stack, what's still needed (signed URLs, push notifications).

## LGPD Tenant Purge Automation (2026-04-09)

- **Cron job**: `/api/v1/cron/lgpd-purge` runs daily at `30 3 * * *` (03:30 BRT)
- **Retention period**: 90 days after tenant `subscriptionStatus = "CANCELED"`
- **Scope**: Hard-deletes all tenant-scoped data (AuditLog, ReminderLog, PaymentReminderLog, JournalNote, JournalEntry, ClinicalSession, Appointment, Payment, Charge, FileObject, Membership, Patient, then Tenant)
- **Safety**: Each tenant deletion wrapped in `db.$transaction()` for atomicity; counts logged via `TENANT_LGPD_PURGED` audit entry written BEFORE deletion
- **Helper**: `src/lib/lgpd.ts` exports `LGPD_TENANT_RETENTION_DAYS = 90` and `computeTenantPurgeCutoff()`
- **No patient-level retention automation yet** — JournalEntry soft-delete GC is already handled by `/api/v1/cron/soft-delete-gc` (30-day retention); future: could add 2-year journal retention per spec

## Known operational requirement

- The private bucket `support-attachments` **must exist** in every
  Supabase project. Created in prod (`tgkgcapoykcazkimiwzw`) and
  staging (`kwqazxlnvbcwyabbomvc`) on 2026-04-08; any future project
  needs this provisioned before inbound attachments work.
