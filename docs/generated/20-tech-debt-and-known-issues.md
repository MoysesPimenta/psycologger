# Technical Debt and Known Issues

This document catalogues technical debt, known issues, and areas for improvement in Psycologger. Items are prioritized by impact and effort.

---

## Open performance debt

### Patient detail page — single monolithic query (priority: medium)

**Status:** OPEN (identified 2026-04-07)

**Description:** `src/app/app/patients/[id]/page.tsx` loads patient + 5 relations (appointments, clinicalSessions, charges with nested payments, files, contacts, assignedUser) in one Prisma query before rendering anything. On a patient with lots of history, this blocks first paint by 800ms+.

**Recommended fix (~3 hours):** Two Suspense islands, not six. Split into:
1. `page.tsx` — fast: only patient demographics + assignedUser. Renders immediately.
2. `<PatientTabs>` — server component, slow query, wrapped in `<Suspense fallback={<PatientTabsSkeleton />}>`.

Why two and not six: every Suspense boundary is a perceived render flicker. Two hits the 80/20 — therapists see the patient identity in <200ms, then a 300-500ms skeleton resolves into the rest. Six boundaries means the page looks like it's loading forever.

**Why deferred:** Touches a high-traffic page, needs visual QA on real data, and is its own discrete change worth a clean commit + preview deploy review.

---

## Critical Debt

### 1. CPF Stored Plaintext ✅ RESOLVED (2026-04-07)

**Status**: RESOLVED

**Description**: CPF (Cadastro de Pessoa Física, Brazilian tax ID) is now encrypted at rest with AES-256-GCM.

**Resolution**:
- `prisma/schema.prisma`: `Patient.cpf` now encrypted with `enc:v1:` prefix
- `prisma/schema.prisma`: `Patient.cpfBlindIndex` added for searchable encryption (HMAC-SHA256)
- `src/lib/cpf-crypto.ts`: `encryptCpf()` and `decryptCpf()` utilities
- `src/lib/cpf-crypto.ts`: `cpfBlindIndex()` for deterministic lookup
- `src/app/api/v1/patients/route.ts`: POST/GET write/search blind index
- `src/app/api/v1/cron/encrypt-cpfs`: Backfill cron job (runs 04:45 UTC daily)
- `vercel.json`: Cron scheduled (path: `/api/v1/cron/encrypt-cpfs`, schedule: `45 4 * * *`)

**Implementation Details**:
- Encrypted CPFs stored as `enc:v1:<base64>` (sentinel prefix for migration)
- Blind index allows `WHERE cpfBlindIndex = HMAC(...)` queries without decryption
- Backfill is idempotent (already-encrypted values skipped)
- Detection: `isCpfShapedQuery()` detects 11-digit patterns in search

**Timeline**: Completed 2026-04-07

---

### 2. Clinical Session Notes Not Encrypted ✅ RESOLVED (2026-04-07)

**Status**: RESOLVED

**Description**: Clinical session notes (`ClinicalSession.noteText`) are now encrypted at rest with AES-256-GCM.

**Resolution**:
- `src/lib/clinical-notes.ts`: `encryptNote()` and `decryptNote()` utilities
- `ClinicalSession.noteText` stored as `enc:v1:<base64>` (sentinel prefix)
- `decryptNote()` warns on plaintext reads in production
- `CLINICAL_NOTES_REJECT_PLAINTEXT=1` env var enables hard rejection of plaintext
- `src/app/api/v1/cron/encrypt-clinical-notes`: Backfill cron job (runs 04:30 UTC daily)
- `vercel.json`: Cron scheduled (path: `/api/v1/cron/encrypt-clinical-notes`, schedule: `30 4 * * *`)

**Implementation Details**:
- Encrypted notes stored as `enc:v1:<base64>` (sentinel prefix for migration)
- Backfill is idempotent (already-encrypted values skipped)
- Production can enable strict mode via env var for audit enforcement

**Timeline**: Completed 2026-04-07

---

### 3. Structured Logging — Partial Adoption

**Status**: Logger implemented (`src/lib/logger.ts`), adoption ~50% as of 2026-04-07.

**Description**: A structured JSON logger with `info/warn/error/debug` levels and PHI-safe error serialization exists at `src/lib/logger.ts` and is used by cron endpoints and rate-limit denial paths. However, ~15+ API route files still call raw `console.error()` directly, mostly in email-failure catch blocks. Migration is incremental and safe.

**Impact**:
- Operations: Hard to parse logs from Vercel dashboard
- Debugging: No request context chain
- Monitoring: Cannot set alert rules on specific log levels or fields
- Compliance: Audit logs use database, application logs are unstructured

**Examples of Unstructured Logs**:
```typescript
// Current
console.error("Failed to send email:", error);
console.log("Payment processed for tenant:", tenantId);

// Should be
logger.error('email_send_failed', {
  error: error.message,
  template: 'invite-staff',
  tenantId, requestId, timestamp
});
logger.info('payment_processed', {
  tenantId, paymentId, amount, currency, requestId
});
```

**Affected Code**:
- Scattered `console.log/error` calls in 20+ files
- No centralized logger

**Fix Options**:
1. **Minimal**: Create wrapper logger (`src/lib/logger.ts`) that formats to JSON
2. **Better**: Integrate Winston or Pino logger
3. **Best**: Add log aggregation (e.g., Datadog, LogRocket)

**Effort**: Small remaining work (~4-6 hours)
- ✅ Logger abstraction (`src/lib/logger.ts`) — DONE
- ☐ Replace remaining ~15 `console.error` calls in API routes
- ☐ Integrate with error tracking (Sentry) — separate task
- ☐ Update tests

**Risk**: Low (logging changes are safe)

**Timeline**: Q2 2026

**Last verified against code**: 2026-04-07

---

## High Debt

### 1. Manual Data Fetching (No SWR/React Query)

**Status**: Active in production

**Description**: All client-side data fetching uses manual `useEffect` + `useState`. No automatic caching, deduplication, refetching, or error handling.

**Impact**:
- Code duplication: Same fetch pattern repeated 20+ times
- Performance: No cache, full data re-fetch on mount
- User experience: Loading spinners for every request
- Error handling: Inconsistent error messages and retry logic

**Affected Code**:
```typescript
// Current: Manual fetch
export function PatientList() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/patients')
      .then(res => res.json())
      .then(data => setPatients(data.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return <div>{patients.map(...)}</div>;
}
```

**Fix**: Use SWR or React Query:
```typescript
// With SWR
export function PatientList() {
  const { data: patients, isLoading, error } = useSWR('/api/patients', fetcher);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{patients.map(...)}</div>;
}
```

**Recommendation**:
- Use **SWR** for simplicity (smaller bundle)
- Or **React Query** for advanced features (mutations, infinite queries)

**Effort**: Medium (4-5 days)
- Install SWR/React Query
- Create SWRConfig context (API base URL, error handling)
- Replace 20+ fetch patterns
- Update tests

**Risk**: Low (SWR is stable and widely used)

**Timeline**: Q2-Q3 2026

---

### 2. Hardcoded Portuguese Strings (No i18n) ✅ RESOLVED (2026-04-09)

**Status**: RESOLVED

**Description**: Internationalization now implemented with next-intl framework.

**Resolution**:
- `i18n.config.ts`: next-intl configuration with locales (pt-BR, en, es)
- `messages/pt-BR.json`, `messages/en.json`, `messages/es.json`: Translation files
- `getTranslations()` imported in server components (e.g., `src/app/app/patients/new/page.tsx`)
- Middleware routes requests to locale-specific handlers (`/[locale]/...`)
- Language switcher available in settings

**Implementation Details**:
- pt-BR set as default locale
- Server-side translations via `getTranslations(namespace)`
- Routing supports `/pt-BR/*`, `/en/*`, `/es/*` paths
- Fallback to pt-BR for unlocalized text

**Timeline**: Completed 2026-04-09

---

### 3. No Feature Flag System

**Status**: Gap in production

**Description**: No feature flags. New features deployed immediately to all users. Cannot safely test features in production or run A/B tests.

**Impact**:
- Risk: Cannot gradually roll out features
- Testing: Cannot test in production before full release
- Experimentation: No A/B testing capability
- Rollback: Must redeploy to disable failed feature

**Affected Scenarios**:
- Google Calendar integration (currently stub, needs gradual rollout)
- NFSe integration (currently stub)
- New appointment reminder system
- Changes to payment logic

**Fix Options**:
1. **LaunchDarkly**: Full-featured flag service (premium)
2. **Unleash**: Self-hosted feature flag platform
3. **PostHog**: Product analytics + feature flags (recommended for small teams)
4. **Custom**: Build simple Redis-backed flag system

**Implementation Example** (PostHog):
```typescript
import { useFeatureFlagVariantKey } from 'posthog-js/react';

export function AppointmentReminders() {
  const newReminderSystemEnabled = useFeatureFlagVariantKey('new_reminder_system') === 'control';

  return newReminderSystemEnabled ? <NewReminderUI /> : <OldReminderUI />;
}
```

**Effort**: High (5-7 days)
- Integrate feature flag SDK
- Create admin dashboard UI
- Replace conditional logic throughout app
- Update tests

**Risk**: Medium (depends on chosen provider)

**Timeline**: Q3 2026 (lower priority unless gradual rollout needed soon)

---

### 4. Prisma Type Casts (`as never`) ✅ RESOLVED (2026-04-09)

**Status**: RESOLVED

**Description**: Type casts have been replaced with proper Prisma types.

**Resolution**:
- Queries now use explicit Prisma types via `Prisma.validator` or direct type definitions
- No more `as never` bypasses in active code paths
- Type safety restored across API routes

**Timeline**: Completed 2026-04-09

---

## Medium Debt

### 1. No React Component Tests

**Status**: Gap

**Description**: React Testing Library is installed but unused. No component unit tests. Critical forms (appointment creation, journal entry) rely on e2e tests only.

**Impact**:
- Testing: Form validation not unit tested
- Speed: E2E tests are slow and flaky
- Maintenance: Cannot isolate component bugs

**Affected Components**:
- `AppointmentForm`
- `JournalEntryForm`
- `PatientForm`
- `PaymentForm`

**Fix**: Add Jest + React Testing Library tests:
```typescript
import { render, screen, userEvent } from '@testing-library/react';
import { AppointmentForm } from './AppointmentForm';

test('should validate required fields', async () => {
  render(<AppointmentForm />);

  const submitButton = screen.getByRole('button', { name: /agendar/i });
  await userEvent.click(submitButton);

  expect(screen.getByText(/data é obrigatória/i)).toBeInTheDocument();
});
```

**Effort**: High (5-7 days)
- Set up React Testing Library
- Add tests for 5 critical components
- Add tests for form validation
- Add tests for error states

**Risk**: Low (standard testing library)

**Timeline**: Q3 2026 (medium priority)

---

### 2. No Visual Regression Tests

**Status**: Gap

**Description**: No automated visual regression detection. Layout changes can slip into production unnoticed.

**Impact**:
- QA: Cannot catch UI regressions automatically
- Responsiveness: Mobile breakpoint issues not detected
- Accessibility: Color/contrast changes not caught

**Tools**:
- Percy (easiest, paid)
- Chromatic (good for Storybook)
- BackstopJS (self-hosted)

**Effort**: High (4-6 days)
- Set up visual regression tool
- Create baseline screenshots (50+ pages)
- Integrate with CI

**Risk**: Low (standard VRT tooling)

**Timeline**: Q4 2026 (lower priority, no known visual bugs)

---

### 3. Stub Integrations (Google Calendar, NFSe) — PARTIALLY RESOLVED (2026-04-09)

**Status**: Google Calendar and NFSe now implemented; future integrations may have similar patterns

**Description**: Google Calendar OAuth2 flow and NFSe (PlugNotas) integration now complete.

**Completed**:
- Google Calendar: OAuth2 flow, token storage, event sync
- NFSe: PlugNotas adapter with credential CRUD, issue/cancel/status-check

**See**: `/docs/generated/16-integrations.md` for details.

**Timeline**: Completed 2026-04-09

---

### 4. Multiple Cron Jobs — PARTIALLY RESOLVED (2026-04-09)

**Status**: Appointment reminders implemented; payment reminders in place; additional jobs proposed

**Description**: Cron jobs now include appointment reminders. Additional automation possible.

**Current Jobs**:
```typescript
// GET /api/cron/payment-reminders (daily 9 AM)
// Sends reminder emails for invoices due within 7 days

// POST /api/cron/appointment-reminders (registered in vercel.json)
// Triggers appointment reminders

// POST /api/v1/cron/lgpd-purge (daily 3:30 AM BRT)
// Purges tenant data 90 days after cancellation

// POST /api/v1/cron/encrypt-clinical-notes (daily 4:30 AM UTC)
// Backfill: encrypts plaintext clinical notes

// POST /api/v1/cron/encrypt-cpfs (daily 4:45 AM UTC)
// Backfill: encrypts plaintext CPFs

// POST /api/v1/cron/nfse-status-check (scheduled)
// Checks NFSe document status
```

**Proposed Additional Jobs**:
- Session follow-up surveys (24 hours after)
- Inactive user notifications (weekly)

**Effort**: Medium (1-2 days per additional job)

**Risk**: Low (standard cron pattern)

**Timeline**: Q3 2026

---

### 5. Data Deletion Automation (LGPD) ✅ RESOLVED (2026-04-09)

**Status**: RESOLVED

**Description**: LGPD Data Subject Access Request (DSAR) automation now implemented.

**Resolution**:
- **Patient-level DSAR**: Endpoints at `/api/v1/patients/[id]/dsar/`:
  - `export`: Download patient data as JSON/CSV
  - `delete`: Soft-delete patient record
  - `anonymize`: Anonymize patient data (pseudonymization)
- **Tenant-level purge**: Cron job `/api/v1/cron/lgpd-purge` runs daily at 03:30 BRT
  - Purges all tenant-scoped data 90 days after `subscriptionStatus = CANCELED`
  - Hard-delete wrapped in transaction for atomicity
  - Audit entry logged before deletion
- **Audit trail**: All deletions recorded via `PATIENT_DELETED` audit action
- **Soft delete GC**: Journal entry soft-delete garbage collection at `/api/v1/cron/soft-delete-gc` (30-day retention)

**Implementation Details**:
- `src/lib/lgpd-dsar.ts`: DSAR helper functions
- `src/lib/lgpd.ts`: Tenant purge logic and retention constants
- Immutable audit logs preserved (LGPD exception)

**Timeline**: Completed 2026-04-09

---

## Low Debt

### 1. No Dark Mode Support

**Status**: Not implemented

**Description**: Application has no dark mode. Nice-to-have feature for accessibility and UX.

**Impact**: Low (aesthetic only)

**Effort**: Medium (2-3 days)

**Timeline**: Q4 2026 or later

---

### 2. No PWA/Mobile App Support

**Status**: Not implemented

**Description**: No Progressive Web App (PWA) features. Desktop-first design. No native mobile app.

**Impact**: Low (mostly desktop users, mobile web still works)

**Effort**: High (5+ days for PWA, 10+ days for native app)

**Timeline**: Q1 2027 or later (if mobile expansion planned)

---

### 3. No Multi-Language Support

**Status**: Not implemented

**Description**: Portuguese (pt-BR) only. Would require i18n framework (see High Debt section).

**Impact**: Low (target market is Brazil)

**Effort**: Medium (combined with i18n infrastructure)

**Timeline**: Only if expansion to other countries planned

---

### 4. No Webhooks

**Status**: Not implemented

**Description**: No outgoing webhooks. Integrators cannot subscribe to events (e.g., "appointment created", "payment received").

**Impact**: Low (single-tenant early stage, no integrations yet)

**Effort**: Medium (3-4 days)

**Timeline**: Q4 2026 or later (if third-party integrations needed)

---

### 5. No API Versioning Beyond v1

**Status**: Active

**Description**: All routes use `/api/v1/`. No versioning strategy for breaking changes. Should define:
- Deprecation policy (6-month notice?)
- Versioned routes (`/api/v1/`, `/api/v2/`)
- API changelog

**Impact**: Low (single API version, no external consumers yet)

**Effort**: Low (framework setup, 1-2 days)

**Timeline**: Q3 2026 or later (when external API consumers exist)

---

## Known Issues

### Issue 1: libsodium References in Lock File

**Status**: Resolved (references removed from next.config)

**Description**: Previous versions referenced libsodium (native crypto library). Removed from config but may linger in npm lock file.

**Workaround**:
```bash
npm ci  # Use lock file as-is
# or
npm install  # Regenerate lock file (removes libsodium refs)
```

**Impact**: Very low (no functional impact)

---

### Issue 2: Portal Email-Test Endpoint Reference

**Status**: Resolved (cleaned up from middleware)

**Description**: Old reference to `/api/email-test` endpoint in middleware comments/code. Endpoint no longer exists.

**Workaround**: Remove from middleware if encountered.

**Impact**: Very low (only comment/dead code)

---

### Issue 3: Recurring Appointment Timezone Handling

**Status**: Active issue

**Description**: Recurring appointments may have issues with daylight saving time (DST) transitions. Timezone handling needs review.

**Example**:
- Create recurring appointment: 9:00 AM weekly
- During DST transition: Appointment time shifts to 8:00 AM (one week) or 10:00 AM (next week)

**Affected Code**: `src/lib/appointment-utils.ts`

**Fix**: Use time zone-aware calculation (not supported by native JavaScript Date):
```typescript
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const timeZone = 'America/Sao_Paulo';
const nextOccurrence = addWeeks(
  toZonedTime(appointmentTime, timeZone),
  1
);
```

**Effort**: Low-Medium (1-2 days)

**Risk**: Low (rare edge case)

**Timeline**: Q3 2026

---

### Issue 4: Encryption Key Rotation Needs Battle-Testing

**Status**: Active feature (new, not battle-tested)

**Description**: Key rotation system implemented but not extensively tested in production. Concerns:
- Old keys retained but decryption order unclear
- No monitoring for key rotation failures
- No audit trail of key rotation events

**Affected Code**: `src/lib/crypto.ts`, `encryptionKey` rotation history

**Fix**:
1. Add comprehensive key rotation tests (edge cases)
2. Add Sentry monitoring for decryption failures
3. Add audit log entry for key rotation events
4. Document key rotation procedure

**Effort**: Low-Medium (1-2 days)

**Risk**: Medium (crypto is sensitive)

**Timeline**: Q2 2026

---

### Issue 5: Partial Payment Remainder Logic (Complex)

**Status**: Active feature

**Description**: Payment remainder handling is complex and not fully tested:
- Charge of $100, patient pays $50
- Remainder of $50 needs to be tracked
- Multiple partial payments on same charge
- Refund of partial payment (should refund remainder too?)

**Affected Code**:
- `src/app/api/payments/charge` (create payment)
- `src/app/api/payments/refund` (process refund)
- Financial calculations

**Concerns**:
- Database atomicity (concurrent payments)
- Rounding errors (currency cents)
- Ledger consistency (total charged ≠ total paid)

**Fix**:
1. Add integration test for multi-payment scenario
2. Use database transactions properly
3. Add ledger verification query
4. Document expected behavior

**Effort**: Medium (2-3 days)

**Risk**: High (financial correctness critical)

**Timeline**: Q2 2026

---

## Roadmap Priorities

### Q2 2026 (Immediate - 6-8 weeks)
1. **CPF encryption** (critical security)
2. **Clinical session note encryption** (critical security)
3. **LGPD automated data deletion** (regulatory compliance)
4. **Structured logging** (operational improvement)
5. **Replace `as never` type casts** (code quality)
6. **Encrypt CPF for CPF search** (search improvement)

### Q3 2026 (Medium - 8-12 weeks)
1. **SWR/React Query integration** (UX improvement, performance)
2. **Feature flag system** (operational flexibility)
3. **Component unit tests** (testing coverage)
4. **Appointment reminder cron** (product feature)
5. **Timezone/DST fix** (bug fix)

### Q4 2026 (Later - 12-16 weeks)
1. **Visual regression tests** (QA automation)
2. **i18n framework setup** (if multilingual needed)
3. **Google Calendar integration** (product feature)
4. **NFSe integration** (product feature)
5. **Single-sign-on (SSO) support** (enterprise feature)

### Q1 2027+ (Distant - 16+ weeks)
1. PWA/Mobile support
2. Webhook support
3. API versioning strategy
4. Dark mode

---

## Monitoring Debt Progress

Track debt reduction via:
1. **GitHub Issues**: Tag with `tech-debt` label
2. **Sprint Planning**: Dedicate 20-30% sprint capacity to debt
3. **Metrics**: Track code coverage, TypeScript error count, test count
4. **Reviews**: Monthly team review of debt priorities

---

## Contact for Debt Discussions

- **Product Lead**: Decision on trade-offs (feature vs. debt)
- **Tech Lead**: Prioritization and estimation
- **QA**: Testing strategy for debt fixes

---

**Last verified against code:** 2026-04-09
- i18n (next-intl): RESOLVED (as of 2026-04-09)
- Google Calendar sync: RESOLVED (as of 2026-04-09)
- NFSe integration (PlugNotas): RESOLVED (as of 2026-04-09)
- LGPD DSAR + tenant purge automation: RESOLVED (as of 2026-04-09)
- Appointment reminder cron: RESOLVED (as of 2026-04-09)
- `as never` type casts: RESOLVED (as of 2026-04-09)
- CPF encryption: RESOLVED (as of 2026-04-07)
- Clinical notes encryption: RESOLVED (as of 2026-04-07)
- Default appointment types seeding implemented (Avaliação inicial, Sessão de psicoterapia, Atendimento online)

