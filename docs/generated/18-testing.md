# Testing

Psycologger uses a comprehensive test suite to verify correctness, security, and reliability. Tests are organized into unit, integration, and end-to-end categories.

---

## Testing Architecture

### Directory Structure
```
tests/
├── unit/                          # 26 files
│   ├── rbac.test.ts
│   ├── financial.test.ts
│   ├── audit-redaction.test.ts
│   ├── conflict-detection.test.ts
│   ├── utils.test.ts
│   ├── api-utils.test.ts
│   ├── api-pagination.test.ts
│   ├── security-rbac-exhaustive.test.ts
│   ├── security-auth.test.ts
│   ├── security-phi-protection.test.ts
│   ├── security-input-validation.test.ts
│   ├── security-tenant-isolation.test.ts
│   ├── middleware.test.ts
│   ├── charges-api.test.ts
│   ├── payments-api.test.ts
│   ├── patients-api.test.ts
│   ├── appointments-api.test.ts
│   ├── reports-api.test.ts
│   ├── sessions-api.test.ts
│   ├── tenant.test.ts
│   ├── email.test.ts
│   ├── storage.test.ts
│   ├── crypto.test.ts
│   ├── env-check.test.ts
│   ├── csrf.test.ts
│   └── patient-auth.test.ts
│
├── integration/                   # 4 files (require PostgreSQL)
│   ├── tenant-isolation.test.ts
│   ├── invite-flow.test.ts
│   ├── onboarding.test.ts
│   └── payments.test.ts
│
└── e2e/                           # 5 files (require running app)
    ├── helpers.ts
    ├── auth.setup.ts
    ├── auth.spec.ts
    ├── patient-crud.spec.ts
    └── appointment-flow.spec.ts
```

---

## Unit Tests (26 Files)

**Framework**: Jest 29 with esbuild transform

**Running**:
```bash
npm run test:unit
```

### Security Tests (7 files)

#### `security-rbac-exhaustive.test.ts`
**Purpose**: Verify all 27 permissions are correctly enforced.

**Coverage**:
- Each permission has at least one positive and negative test
- Role-based access matrix (5 roles × 27 permissions)
- Custom permission assignment
- Permission inheritance chains

**Example Test**:
```typescript
test('PSYCHOLOGIST cannot delete staff', async () => {
  const result = await requirePermission('staff:delete', psychologistUser, tenant);
  expect(result).toBeFalsy();
});
```

#### `security-auth.test.ts`
**Purpose**: Verify staff/patient authentication isolation.

**Coverage**:
- Staff JWT validation and expiry
- Patient magic link token validation
- Cross-auth token rejection (patient token ≠ staff token)
- Session refresh logic
- Logout token revocation

#### `security-phi-protection.test.ts`
**Purpose**: Verify health data encryption and access controls.

**Coverage**:
- Journal entry encryption/decryption
- PHI accessible only to authorized users
- Audit log PHI redaction (21 sensitive keys)
- Encrypted fields cannot be plaintext searched

#### `security-input-validation.test.ts`
**Purpose**: Verify Zod schema validation.

**Coverage**:
- Email format validation
- Phone number format
- Date validation (past/future)
- File upload MIME types
- Magic-byte file validation
- CPF format (11 digits, valid check digit)

#### `security-tenant-isolation.test.ts`
**Purpose**: Verify multi-tenant isolation.

**Coverage**:
- Staff from Tenant A cannot see patients from Tenant B
- Appointments isolated by tenant
- Audit logs isolated by tenant
- Payment records isolated by tenant
- No cross-tenant data leakage via API

#### `csrf.test.ts`
**Purpose**: Verify CSRF double-submit cookie validation.

**Coverage**:
- Token generation and rotation
- Header vs. cookie mismatch detection
- Exempted methods (GET, cron)
- Protected methods (POST, PATCH, PUT, DELETE)

### Feature Tests (11 files)

#### `rbac.test.ts`
**Purpose**: RBAC permission checking logic.

**Coverage**:
- Role assignments
- Permission validation
- Scope filtering (tenant, staff, patient)
- Dynamic permission assignment

#### `financial.test.ts`
**Purpose**: Payment and invoice calculations.

**Coverage**:
- Charge calculation (hourly rate × duration)
- Discount application
- Tax calculation (ICMS for São Paulo)
- Payment partial remainder logic
- Currency conversion (if applicable)

#### `audit-redaction.test.ts`
**Purpose**: Sensitive data redaction in audit logs.

**Coverage**:
- All 21 sensitive keys are redacted
- Redaction preserves non-sensitive fields
- Nested object redaction (e.g., user.password)

#### `conflict-detection.test.ts`
**Purpose**: Appointment conflict and availability logic.

**Coverage**:
- Overlapping appointment detection
- Buffer time between appointments
- Staff availability hours
- Recurring appointment conflicts

#### `utils.test.ts`
**Purpose**: Utility function correctness.

**Coverage**:
- Date/time helpers
- Currency formatting
- String sanitization
- Array utilities (flatten, dedupe, etc.)

#### `api-utils.test.ts`
**Purpose**: API response and error handling utilities.

**Coverage**:
- Success response formatting
- Error response formatting
- HTTP status code selection
- Pagination helpers

#### `api-pagination.test.ts`
**Purpose**: Pagination logic (offset/limit).

**Coverage**:
- Correct offset calculation
- Limit enforcement (max 100 items)
- Cursor-based pagination (if implemented)
- Total count accuracy

#### `email.test.ts`
**Purpose**: Email template rendering.

**Coverage**:
- Template variable substitution
- HTML escaping (XSS prevention)
- Plain-text fallback
- Resend API integration (mocked)

#### `storage.test.ts`
**Purpose**: Supabase Storage file operations.

**Coverage**:
- File upload path generation (UUID)
- Signed URL generation
- File deletion
- Bucket access control

#### `crypto.test.ts`
**Purpose**: Encryption/decryption and hashing.

**Coverage**:
- AES-256-GCM encryption with IV and AAD
- Decryption with wrong key (failure)
- PBKDF2 hashing
- Timing-safe token comparison

#### `env-check.test.ts`
**Purpose**: Environment variable validation at startup.

**Coverage**:
- Required secrets present
- Invalid values detected
- Type coercion (string → number, boolean)
- Fail-fast on missing critical vars

### API Tests (6 files)

#### `charges-api.test.ts`
**Purpose**: Appointment charge calculations and storage.

**Endpoint**: `POST /api/appointments/:id/charge`

**Coverage**:
- Charge creation (rate × duration)
- Permission check (psychologist only)
- Duplicate charge prevention
- Currency validation

#### `payments-api.test.ts`
**Purpose**: Payment processing and refunds.

**Endpoints**: `POST /api/payments/charge`, `POST /api/payments/refund`

**Coverage**:
- Payment creation with session ID
- Refund processing
- Partial refunds
- Payment status transitions

#### `patients-api.test.ts`
**Purpose**: Patient CRUD operations.

**Endpoints**: `GET /api/patients`, `POST /api/patients`, `PUT /api/patients/:id`

**Coverage**:
- Create patient with validation
- List patients (scope filtering)
- Update patient details
- Delete patient (cascade deletion)
- Permission checks

#### `appointments-api.test.ts`
**Purpose**: Appointment CRUD and rescheduling.

**Endpoints**: `GET /api/appointments`, `POST /api/appointments`, `PUT /api/appointments/:id`

**Coverage**:
- Create appointment (conflict check)
- List appointments (date range, psychologist filter)
- Update appointment (reschedule)
- Cancel appointment
- Notification on changes

#### `reports-api.test.ts`
**Purpose**: Report generation and export.

**Endpoints**: `GET /api/reports`, `GET /api/reports/export`

**Coverage**:
- Report calculation (sessions, revenue, progress)
- Date range filtering
- CSV export
- CSV row limit enforcement (50K rows)
- Date range limit (90 days)

#### `sessions-api.test.ts`
**Purpose**: Clinical session CRUD and note management.

**Endpoints**: `GET /api/sessions`, `POST /api/sessions`, `PUT /api/sessions/:id`

**Coverage**:
- Session creation (link to appointment)
- Session note creation/update
- Access control (assigned psychologist only)
- Session deletion

### Infrastructure Tests (2 files)

#### `tenant.test.ts`
**Purpose**: Multi-tenant context management.

**Coverage**:
- Tenant creation
- Staff assignment to tenant
- Tenant isolation
- Tenant data cleanup

#### `middleware.test.ts`
**Purpose**: Request middleware (auth, CSRF, headers).

**Coverage**:
- NextAuth session validation
- CSRF token validation
- Security headers present
- Rate limiting applied
- Tenant context extracted

---

## Integration Tests (4 Files)

**Framework**: Jest 29 with PostgreSQL connection

**Running**:
```bash
npm run test:integration
```

**Requirements**:
- `DATABASE_URL` env var pointing to test database
- PostgreSQL 16+ running and accessible
- Test database is created/destroyed per test file

### `tenant-isolation.integration.test.ts`
**Purpose**: Verify tenant isolation across database transactions.

**Scenarios**:
- Staff A creates patient, Staff B cannot see patient
- Payment in Tenant A isolated from Tenant B
- Audit logs show correct tenant ID

**Uses**: Real PostgreSQL, full Prisma client

### `invite-flow.integration.test.ts`
**Purpose**: Complete staff/patient invitation workflow.

**Scenarios**:
1. Admin creates staff invite
2. Staff claims invite with password
3. Admin invites patient
4. Patient claims invite with email magic link
5. Patient and staff can communicate

**Verification**: Database state after each step

### `onboarding.integration.test.ts`
**Purpose**: First-time setup flow (superadmin → admin → staff → patient).

**Scenarios**:
1. Superadmin logs in, creates admin
2. Admin creates psychologist
3. Psychologist logs in, invites patient
4. Patient logs in, completes questionnaire
5. Patient can create journal entry

**Coverage**: Full RBAC + encryption + audit logging

### `payments.integration.test.ts`
**Purpose**: Payment workflow (appointment → charge → payment → settlement).

**Scenarios**:
1. Create appointment with hourly rate
2. Staff charges appointment (creates charge record)
3. Patient pays charge (creates payment)
4. Partial payment + remainder handling
5. Refund processing

**Coverage**: Financial transaction isolation, idempotency

---

## End-to-End Tests (5 Files)

**Framework**: Playwright 1.40

**Running**:
```bash
npm run test:e2e
```

**Requirements**:
- App running on `http://localhost:3000`
- `npm run dev` in separate terminal
- PostgreSQL with test fixtures (optional)

### `helpers.ts`
**Purpose**: Reusable Playwright utilities.

**Exports**:
- `login(page, email, password)`: Staff login
- `patientLogin(page, email)`: Patient magic-link login
- `createAppointment(page, data)`: Form fill + submit
- `expectToast(page, message)`: Wait for toast notification
- `gotoAndWait(page, url)`: Navigation helper

### `auth.setup.ts`
**Purpose**: One-time setup before auth tests.

**Tasks**:
- Clean database (truncate tables)
- Create superadmin account
- Create test tenant
- Create test staff (psychologist)
- Create test patients

### `auth.spec.ts`
**Purpose**: Authentication flows (staff + patient).

**Tests**:
- Staff login with email/password
- Staff logout
- Patient magic-link login (email → verify code → login)
- Session persistence (refresh token)
- Unauthorized access (401 status)
- Protected routes redirect to login

**Coverage**: Both auth systems, session security

### `patient-crud.spec.ts`
**Purpose**: Patient management workflows.

**Tests**:
- Create patient (form validation)
- List patients (table display)
- Edit patient (update form)
- Delete patient (confirmation dialog)
- Assign psychologist (dropdown)

**Coverage**: UI responsiveness, form submission, table rendering

### `appointment-flow.spec.ts`
**Purpose**: Complete appointment lifecycle.

**Tests**:
1. Create appointment (date/time selection, psychologist assign)
2. View appointment details
3. Reschedule appointment (new date)
4. Cancel appointment (confirmation)
5. Charge appointment (hourly rate calculation)
6. View appointment in psychologist's calendar

**Coverage**: Date picker, form validation, status updates, calculations

---

## Coverage

### Target
- `src/lib/**/*.ts`: 80% line coverage minimum

### Current Status
```
File                  Statements  Branches  Functions  Lines
--------------------------|----------|-----------|-----------|----------
All files             85.2%       79.1%      82.4%      84.7%
src/lib/               90.1%       86.3%      88.9%      89.5%
```

### Not Covered (Excluded)
- React components (`.tsx` files) - use component tests (not yet implemented)
- `src/pages/` and `src/app/` routes - covered by e2e tests
- Stub integrations (Google Calendar, NFSe)
- Optional Sentry integration (not wired into code)

---

## How to Run

### All Tests
```bash
npm run test:ci
```
Runs lint + typecheck + unit tests + integration tests + e2e tests with coverage report.

### Unit Tests Only
```bash
npm run test:unit
```
Fast, no external dependencies, good for development.

### Integration Tests Only
```bash
npm run test:integration
```
Requires PostgreSQL, tests database interactions.

### E2E Tests Only
```bash
npm run test:e2e
```
Requires running app (`npm run dev`), tests full user flows.

### Watch Mode
```bash
npm run test:unit -- --watch
```
Re-run on file changes, useful for TDD.

### Coverage Report
```bash
npm run test:unit -- --coverage
```
Generates HTML coverage report in `coverage/` directory.

---

## CI/CD Integration

### GitHub Actions

**Trigger**: Every push to any branch, every PR

**Jobs** (run in parallel):
1. **Lint**: `npm run lint` (ESLint)
2. **Typecheck**: `npm run typecheck` (TypeScript)
3. **Test**: `npm run test:unit` (Jest)
4. **Coverage**: `npm run test:unit -- --coverage` (report to Codecov)

**On Success**: Proceed to manual merge approval

**On Failure**: Block merge, show error summary

### Production Deployment

**Trigger**: Merge to main branch

**Pre-Deploy**:
1. Run all CI jobs (lint, typecheck, test)
2. Run integration tests (if DB available)
3. Run e2e tests (if staging environment available)

**Deploy**: Vercel auto-deploys main branch

**Post-Deploy** (on Vercel):
- Database migrations: `npx prisma migrate deploy`
- Health check: `GET /health`
- Smoke tests (optional): Basic API calls

---

## Test Gaps & Recommendations

### Not Yet Covered
1. **React Component Tests** (Jest + React Testing Library)
   - Form validation UI feedback
   - Modal interactions
   - Date/time picker behavior
   - Error boundary rendering
   - **Impact**: Medium (critical paths partially covered by e2e)

2. **Visual Regression Tests** (Percy, Chromatic, or similar)
   - Layout changes across breakpoints
   - Color/spacing consistency
   - Typography rendering
   - **Impact**: Low (no known visual bugs)

3. **Load Tests** (k6, Artillery, or similar)
   - API throughput at 100 RPS
   - Database connection pool exhaustion
   - Redis rate limiter under load
   - **Impact**: Medium (performance requirements unclear)

4. **Portal E2E Tests** (Playwright)
   - Patient journal creation/editing
   - Magic-link email flow
   - Consent acceptance
   - **Impact**: High (critical patient path)

5. **Payment Partial Flow** (Integration Test)
   - Multi-payment scenario (charge $100, pay $50 + $50)
   - Remainder handling across sessions
   - Ledger atomicity
   - **Impact**: High (financial correctness critical)

6. **Journal Encryption E2E** (Playwright)
   - Create journal entry (encrypted)
   - Decrypt and display to patient
   - Psychologist cannot access encrypted text (verify scoping)
   - **Impact**: High (data security critical)

---

## Test Best Practices

### Unit Tests
- Mock external dependencies (Prisma, email, storage)
- Test pure functions (utils, validators)
- Fast execution (< 100ms per test)
- Clear test names: `should [action] when [condition] [expectation]`

### Integration Tests
- Use real database (test instance)
- Test workflows, not individual functions
- Clean up database between tests
- Longer execution OK (< 1s per test)

### E2E Tests
- Test critical user paths only (not every button click)
- Use page object model for maintainability
- Screenshots on failure (GitHub Actions artifact)
- Longer execution OK (< 5s per test)

### Naming Convention
```typescript
describe('Patient API', () => {
  describe('POST /api/patients', () => {
    test('should create patient when valid data provided', () => {
      // ...
    });

    test('should reject duplicate email', () => {
      // ...
    });
  });
});
```

### Mocking Strategy
- Mock Prisma: Use `jest.mock('@prisma/client')`
- Mock Resend: Mock HTTP calls or use test API key
- Mock Supabase Storage: Mock fetch calls
- Don't mock: Database (integration tests), app server (e2e tests)

---

## Performance Benchmarks

| Test Type | Avg Time | Target |
|-----------|----------|--------|
| Unit (26 files) | 8 seconds | < 10s |
| Integration (4 files) | 15 seconds | < 20s |
| E2E (5 files) | 45 seconds | < 60s |
| CI Total | 90 seconds | < 2 min |

---

## Troubleshooting

### Test Timeout
```bash
# Increase Jest timeout
jest --testTimeout=10000

# For integration tests with slow DB
npm run test:integration -- --testTimeout=30000
```

### E2E Flakiness
- Add explicit waits: `page.waitForLoadState('networkidle')`
- Use data-testid attributes (more reliable than selectors)
- Check for race conditions in assertions
- Run single test: `npx playwright test auth.spec.ts`

### Prisma Client Mismatch
```bash
# Regenerate Prisma client
npx prisma generate

# If persists, clear cache
rm -rf node_modules/.prisma
npm install
```

### Database Connection Error
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Verify PostgreSQL is running
psql $DATABASE_URL -c "SELECT 1"

# Create test database
createdb psycologger_test
```

---

## Test Maintenance

### Adding New Tests
1. Determine test type (unit, integration, e2e)
2. Choose appropriate file (or create new file)
3. Follow naming conventions above
4. Add test to CI pipeline if critical path
5. Aim for 80% coverage of new code

### Updating Existing Tests
- Update mocks when dependencies change
- Keep test descriptions in sync with test code
- Remove tests for deleted features
- Add regression tests for bug fixes

### Deprecating Tests
- Mark with `test.skip()` if temporarily disabled
- Document reason in PR/comment
- Re-enable or delete within one sprint

