# Technical Debt and Known Issues

This document catalogues technical debt, known issues, and areas for improvement in Psycologger. Items are prioritized by impact and effort.

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

### 2. Hardcoded Portuguese Strings (No i18n)

**Status**: Active in production

**Description**: All UI strings are hardcoded in Portuguese. No i18n framework (next-intl, i18next, etc.). Future multi-language support requires string extraction and framework integration.

**Impact**:
- Maintainability: Strings scattered in components
- Localization: Cannot easily add Portuguese variants (pt-PT vs pt-BR)
- Future scaling: Multi-language expansion blocked

**Examples**:
```typescript
// Current
export function AppointmentForm() {
  return (
    <label>Data da Consulta</label>
    <button>Agendar</button>
  );
}

// Should be
export function AppointmentForm() {
  const { t } = useTranslation();
  return (
    <label>{t('appointment.date')}</label>
    <button>{t('appointment.schedule')}</button>
  );
}
```

**Affected Code**: 50+ React components, 20+ server-side messages

**Fix Options**:
1. **next-intl**: Official Next.js i18n solution (recommended)
2. **i18next**: Popular, mature library
3. **lingui**: Lightweight, good DX

**Effort**: Medium (4-5 days)
- Set up i18n framework
- Extract strings to JSON files
- Replace hardcoded strings (use regex + script)
- Test with multiple languages
- Add language switcher UI

**Risk**: Low (well-established patterns)

**Timeline**: Q3 2026 (lower priority, only needed if multilingual planned)

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

### 4. Prisma Type Casts (`as never`)

**Status**: Active in production

**Description**: Several places use `as never` type casts to bypass TypeScript checks in Prisma queries. Should be refactored to use proper types.

**Examples**:
```typescript
// Current: Type bypass
const patient = await db.patient.findUnique({
  where: { id: patientId as never },
  select: { name: true, email: true } as never,
});

// Should be: Proper types
const patient = await db.patient.findUnique({
  where: { id: patientId },
  select: { name: true, email: true },
});
```

**Impact**:
- Code quality: Bypasses type safety
- Maintenance: Harder to refactor
- Debugging: Errors not caught at type-check time

**Affected Files**: `src/app/api/**` (5+ files)

**Fix**: Refactor queries to avoid type casts:
1. Define Prisma select types
2. Use `Prisma.validator` for reusable selections
3. Update types throughout

**Effort**: Low (1-2 days)

**Risk**: Very low (improves type safety)

**Timeline**: Q2 2026

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

### 3. Stub Integrations (Google Calendar, NFSe)

**Status**: Development

**Description**: Google Calendar and NFSe integrations are defined in schema but not implemented. Requires:
- OAuth flow completion
- API integration with external services
- Error handling and retries
- Status tracking

**See**: `/docs/generated/16-integrations.md` for details.

**Effort**: High per integration (5-10 days each)

**Timeline**: Q3-Q4 2026

---

### 4. Single Cron Job

**Status**: Active

**Description**: Only one cron job: payment reminders (daily at 9 AM). Should add:
- Appointment reminders (1 hour before)
- Session follow-up surveys (24 hours after)
- Inactive user notifications (weekly)

**Current Job**:
```typescript
// GET /api/cron/payment-reminders (daily 9 AM)
// Sends reminder emails for invoices due within 7 days
```

**Proposed Jobs**:
```typescript
// POST /api/cron/appointment-reminders (every 30 min)
// Find appointments starting in next 1 hour, send reminder

// POST /api/cron/session-surveys (daily 9 AM)
// Find sessions from yesterday, send follow-up survey

// POST /api/cron/inactive-users (weekly Monday 9 AM)
// Find users inactive for 30+ days, send re-engagement email
```

**Effort**: Medium (2-3 days per job)

**Risk**: Low (standard cron pattern)

**Timeline**: Q2-Q3 2026

---

### 5. No Data Deletion Automation (LGPD)

**Status**: Gap

**Description**: No automated data deletion workflow. LGPD requires ability to delete patient data (Right to Be Forgotten). Currently manual or missing.

**Required**:
- Patient deletion cascade (patient + appointments + sessions + journal entries)
- Soft delete with delayed hard delete (prevent accidents)
- Audit trail of deletions
- No deletion of immutable audit logs (LGPD exception)

**Implementation**:
```typescript
// Soft delete
await db.patient.update({
  where: { id: patientId },
  data: { deletedAt: new Date() },
});

// Hard delete (30 days later)
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
await db.patient.deleteMany({
  where: { deletedAt: { lte: thirtyDaysAgo } },
});
```

**Effort**: Medium (2-3 days)

**Risk**: High (data loss - requires careful testing)

**Timeline**: Q2 2026 (LGPD compliance)

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

**Last verified against code:** 2026-04-07
- CPF encryption: RESOLVED (as of 2026-04-07)
- Clinical notes encryption: RESOLVED (as of 2026-04-07)
- Default appointment types seeding implemented (Avaliação inicial, Sessão de psicoterapia, Atendimento online)

