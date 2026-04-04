# AI Developer Handoff: Psycologger

## Project Identity

**Name**: Psycologger

**Purpose**: Multi-tenant SaaS clinical practice management system for Brazilian psychologists

**Market**: Brazilian healthcare/psychology sector (Portuguese pt-BR UI)

**Current Maturity**: Pre-beta

**Key Differentiator**: Specialized for psychology practices with built-in compliance for Brazilian regulations (CPF tracking, LGPD consent, NFSe invoicing)

---

## Technology Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Framework** | Next.js | 14 (App Router) | Full-stack React framework with SSR |
| **Language** | TypeScript | Latest | Strict type checking (tsconfig.json: strict: true) |
| **Database** | PostgreSQL | (Supabase hosted) | Primary data store |
| **ORM** | Prisma | 5.22 | Type-safe database access |
| **Authentication** | NextAuth.js | v4 | Staff/admin auth (JWT) |
| **Auth (Patients)** | Custom PatientAuth | In-house | Portal auth (PBKDF2 + magic links) |
| **Email** | Resend | - | Transactional email service |
| **Styling** | Tailwind CSS | - | Utility-first CSS |
| **Components** | Radix UI | - | Accessible component primitives |
| **Encryption** | Node.js crypto | Built-in | AES-256-GCM for sensitive data |
| **Rate Limiting** | Upstash Redis | - | Distributed rate limiting |
| **Hosting** | Vercel | - | Deployment (gru1 São Paulo region) |
| **File Storage** | (TBD) | - | Clinical file storage (stub: local/S3) |

---

## Critical Files & Folders (Read First)

### Schema & Configuration
1. **prisma/schema.prisma** — Source of truth for ALL 30+ data models
   - Auth models, organizational hierarchy, clinical domain, financial, notifications, portal
   - Read this first to understand the data structure

2. **src/lib/rbac.ts** — Role-Based Access Control
   - All 5 roles (SUPERADMIN, TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY)
   - All 27 permissions and conditional permission logic
   - Permission checking functions

3. **.claude/CONTEXT.md** — Existing AI context
   - May contain additional context from previous development sessions

4. **.claude/ROADMAP.md** — Prioritized backlog
   - Known tasks, bugs, and planned features

### Auth & Security
5. **src/lib/auth.ts** — NextAuth configuration
   - JWT strategy, session callbacks, provider setup

6. **src/lib/patient-auth.ts** — Portal authentication
   - PBKDF2 password hashing (600k iterations)
   - Magic link generation and verification
   - Session token management

7. **src/middleware.ts** — Request pipeline entry point
   - Auth context resolution (staff vs patient)
   - CSRF validation
   - TenantId propagation
   - Single point of failure for auth/security

### Core Libraries
8. **src/lib/tenant.ts** — Multi-tenancy context
   - getAuthContext() function
   - TenantId resolution from cookies/headers
   - Auth context typing

9. **src/lib/api.ts** — API utilities
   - handleApiError() for consistent error responses
   - Pagination helpers
   - Response formatting

10. **src/lib/audit.ts** — Audit logging
    - 49 audit actions with PHI redaction
    - Automatic logging of state changes
    - Sensitive field masking

11. **src/lib/crypto.ts** — Encryption/decryption
    - AES-256-GCM implementation
    - Key rotation support
    - Versioned payload format

12. **src/lib/constants.ts** — Magic numbers and config
    - Session timeouts, pagination defaults, limits

### Routing & Handlers
13. **src/app/api/v1/\*\*/route.ts** — All API endpoints
    - 40+ route handlers for staff, patient portal, system
    - Standard pattern: auth → permission → validation → business logic → audit

---

## Where Things Live

### Directory Structure Overview

```
Psycologger/
├── prisma/
│   ├── schema.prisma          # Database schema (CRITICAL)
│   └── migrations/            # Database migrations
├── src/
│   ├── app/
│   │   ├── api/v1/           # 40+ API route handlers
│   │   ├── (app)/            # Staff dashboard routes
│   │   ├── (portal)/         # Patient portal routes
│   │   ├── (sa)/             # SuperAdmin routes
│   │   └── layout.tsx        # Root layout
│   ├── components/           # 50+ UI components (10 groups)
│   ├── lib/                  # 19 library modules (CRITICAL)
│   ├── middleware.ts         # Auth/CSRF middleware (CRITICAL)
│   └── env.ts                # Environment variable validation (Zod)
├── public/                   # Static assets
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── .claude/                  # AI context
│   ├── CONTEXT.md
│   └── ROADMAP.md
├── .env.local               # Secrets (NOT in git)
├── prisma/                  # Database config
├── tsconfig.json            # TypeScript config (strict mode)
├── next.config.js           # Next.js config
└── package.json             # Dependencies
```

### Feature Organization

| Layer | Location | Purpose |
|-------|----------|---------|
| **Auth (Staff)** | src/lib/auth.ts | NextAuth JWT configuration |
| **Auth (Portal)** | src/lib/patient-auth.ts | PBKDF2 + magic links |
| **Multi-tenancy** | src/lib/tenant.ts | TenantId context resolution |
| **RBAC** | src/lib/rbac.ts | Permission checking |
| **API Routes** | src/app/api/v1/\*\*/route.ts | Endpoint handlers |
| **Encryption** | src/lib/crypto.ts | AES-256-GCM |
| **Audit** | src/lib/audit.ts | State change logging |
| **UI Components** | src/components/ | React components |
| **Database** | prisma/schema.prisma | Prisma schema |

---

## Dangerous Areas — Do NOT Modify Casually

### 1. src/lib/crypto.ts
- **Why**: Encryption format must stay backward-compatible
- **Risk**: Changing the encryption algorithm or format breaks all existing encrypted data
- **Safe**: Add new encryption versions to the versioned payload system; support old versions for decryption

### 2. src/lib/patient-auth.ts
- **Why**: Password hashing and session management are security-critical
- **Risk**: Weakening hashing iterations or changing token format compromises patient security
- **Safe**: Only increase iteration count (600k is current baseline); use constant-time comparison

### 3. src/middleware.ts
- **Why**: Single point of failure for all auth and security
- **Risk**: Bugs here affect every request
- **Safe**: Require review before changes; test thoroughly; keep simple

### 4. src/app/api/v1/payments/route.ts
- **Why**: Atomic partial payment logic with transaction
- **Risk**: Non-atomic changes cause payment discrepancies
- **Safe**: Keep all payment operations in a single Prisma transaction

### 5. src/app/api/v1/appointments/route.ts
- **Why**: Recurring appointment slot generation with timezone handling and conflict detection
- **Risk**: Race conditions or timezone bugs cause double-booked appointments
- **Safe**: Conflict detection must run inside transaction; use date-fns-tz for all timezone math

### 6. prisma/schema.prisma
- **Why**: Any model change requires database migration
- **Risk**: Migrations can cause downtime; breaking changes are hard to rollback
- **Safe**: Always create migration with npx prisma migrate dev; test on dev/staging first

### 7. src/lib/rbac.ts
- **Why**: Permission logic is critical security boundary
- **Risk**: Incorrect permission checks expose patient data
- **Safe**: Every permission check must be unit tested; PSYCHOLOGIST scoping to assignedUserId must be verified

---

## Safest Order for Future Development

### Step 1: Understand the Foundation (Day 1)
1. Read **prisma/schema.prisma** end-to-end
2. Read **src/lib/rbac.ts** to understand all roles and permissions
3. Read **.claude/CONTEXT.md** and **.claude/ROADMAP.md**
4. Skim **src/middleware.ts** and **src/lib/tenant.ts** to understand auth flow

### Step 2: For Any New Feature
1. Identify the domain (e.g., "appointments", "patients", "payments")
2. Find a similar existing route handler: `src/app/api/v1/{domain}/route.ts`
3. Copy the pattern (getAuthContext → requirePermission → Zod parse → logic → audit → response)
4. Add tenantId to every query: `where: { tenantId, ... }`
5. Add PSYCHOLOGIST scoping if needed: `where: { tenantId, user: { id: userId } }`
6. Add audit logging for all state changes: `await createAuditLog(...)`

### Step 3: Before Committing
1. Run `npx tsc --noEmit` to check TypeScript
2. Run `npm run test:unit` to check unit tests
3. Verify no console.log statements (use structured logging if logging needed)
4. Verify Zod validation on all inputs
5. Verify audit logging on all state changes
6. Verify tenantId on all queries

### Step 4: For Schema Changes
1. Create migration: `npx prisma migrate dev --name <description>`
2. Update src/lib/rbac.ts if permission scope changes
3. Update audit actions if new entities
4. Run tests and deploy to staging first

---

## Best Next Tasks (Prioritized)

### High Priority (Security/Compliance)
1. **Encrypt CPF field in Patient model**
   - Currently stored plaintext
   - File: prisma/schema.prisma (Patient.cpf)
   - Implement: Add cpfEncrypted field, create migration, add encrypt/decrypt in patient routes
   - Impact: LGPD compliance

2. **Encrypt clinical session noteText**
   - Currently stored plaintext
   - File: src/app/api/v1/sessions/route.ts
   - Implement: Use AES-256-GCM like journal entries
   - Impact: PHI protection

3. **Add appointment reminder cron job**
   - File: src/app/api/cron/appointment-reminders/route.ts (new)
   - Implement: Scheduled task that emails reminders 24h before appointment
   - Trigger: Vercel cron (add to vercel.json)
   - Impact: Engagement

### Medium Priority (Feature Completeness)
4. **Replace useEffect fetching with SWR**
   - Currently: Manual useEffect + useState in components
   - File: src/components/\*\*/\*.tsx
   - Implement: Switch to SWR for data fetching
   - Impact: Better caching, less boilerplate

5. **Add Google Calendar sync**
   - Currently: Stub in src/app/api/v1/integrations/google-calendar/route.ts
   - Implement: OAuth flow, sync bidirectional appointments
   - Impact: Calendar integration

6. **Add structured logging**
   - Currently: console.log/error scattered
   - Implement: Use a logger library (pino, winston)
   - Impact: Production debugging

### Lower Priority (Polish)
7. Add i18n framework (currently hardcoded Portuguese)
8. Add feature flag system
9. Automate LGPD data deletion
10. Add full NFSe integration

---

## Testing Strategy

### Unit Tests
- Location: `tests/unit/`
- Commands: `npm run test:unit`, `npm run test:watch`
- Coverage: Utility functions, validation, business logic

### Integration Tests
- Location: `tests/integration/`
- Database: Uses test PostgreSQL database
- Focus: API routes with database operations

### E2E Tests
- Location: `tests/e2e/`
- Tools: Playwright/Cypress
- Focus: Full user workflows

### Running Tests
```bash
npm run test:unit          # Run all unit tests
npm run test:watch        # Watch mode
npm run test:integration  # Integration tests
npm run test:e2e          # E2E tests (requires live server)
```

---

## Key Principles

### 1. Security First
- Every auth boundary is a potential vulnerability
- Assume all user input is untrusted
- Encrypt sensitive data (see crypto.ts)
- Validate with Zod on every endpoint

### 2. Multi-tenancy is Non-Negotiable
- EVERY query must include tenantId filter
- Patient portal queries must scope by patientAuthId
- PSYCHOLOGIST sees only assigned patients
- ASSISTANT never sees clinical data

### 3. Audit Everything
- Every state-changing operation must have an audit log
- PHI must be redacted in audit summaries
- Audit actions are the source of truth for compliance

### 4. Fail Safely
- Email and file operations are non-fatal
- If a secondary operation fails, the primary operation succeeds
- Use handleApiError() for consistent error responses

### 5. Code Patterns Over Configuration
- Copy existing route handlers as templates
- Follow the auth → permission → validation → logic → audit pattern
- Consistency matters more than cleverness

---

## Common Tasks & Commands

### Development
```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production
npm run start            # Run production build
npx tsc --noEmit        # Type check without emitting
```

### Database
```bash
npx prisma studio              # Open Prisma Studio
npx prisma migrate dev          # Create and run migration
npx prisma migrate deploy       # Run migrations on production
npx prisma generate            # Generate Prisma client
npx prisma db seed             # Run seed script (if exists)
```

### Linting & Formatting
```bash
npm run lint             # Run ESLint
npm run format           # Run Prettier
```

### Deployment
```bash
# Vercel handles this automatically on git push
# Manual: vercel deploy --prod
```

---

## Troubleshooting Guide

### "TenantId is undefined"
- Check: Is tenantId being passed from middleware?
- Fix: Verify src/middleware.ts is running; check getAuthContext() result

### "Permission denied"
- Check: src/lib/rbac.ts requirePermission() call
- Fix: Verify user's role and the required permission

### "Data leaks across tenants"
- Check: Is tenantId included in WHERE clause?
- Fix: Add `tenantId: ctx.tenantId` to every query

### "Encryption/decryption fails"
- Check: Is ENCRYPTION_KEY set in .env.local?
- Fix: Verify key format (32 bytes base64)

### "Tests fail after schema change"
- Check: Did you run npx prisma migrate dev?
- Fix: Regenerate Prisma client: npx prisma generate

---

## Communication & Escalation

If you encounter:
- **Security concerns**: Stop, document, escalate immediately
- **Data loss risks**: Stop, verify, get approval before proceeding
- **Architectural questions**: Check .claude/CONTEXT.md and .claude/ROADMAP.md
- **Schema changes**: Plan migration, test on staging, get review

---

## Next Steps

1. Start with the "Read First" files (prisma/schema.prisma, rbac.ts, auth.ts)
2. Pick a task from "Best Next Tasks" above
3. Find a similar feature and copy its pattern
4. Always run tests before committing
5. Update .claude/CONTEXT.md with any new learnings

Good luck building Psycologger!
