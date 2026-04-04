# Repository Overview

**Psycologger Technical Structure & Development Patterns**

**Generated:** 2026-04-04

---

## Folder Structure

```
psycologger/
├── src/
│   ├── app/                          # Next.js 14 App Router
│   │   ├── (auth)/                   # Public auth pages (login, register)
│   │   │   ├── login/page.tsx        # Staff login
│   │   │   ├── register/page.tsx     # Staff registration
│   │   │   └── ...
│   │   ├── (dashboard)/              # Protected staff dashboard
│   │   │   ├── layout.tsx            # Dashboard sidebar + header
│   │   │   ├── page.tsx              # Dashboard home
│   │   │   ├── patients/             # Patient CRUD pages
│   │   │   ├── appointments/         # Appointment scheduling
│   │   │   ├── sessions/             # Clinical note editor
│   │   │   ├── billing/              # Charges & payments
│   │   │   └── ...
│   │   ├── patient-portal/           # Patient self-service portal
│   │   │   ├── layout.tsx            # Portal sidebar
│   │   │   ├── page.tsx              # Portal home
│   │   │   ├── appointments/         # Book/reschedule
│   │   │   ├── journal/              # Personal journal
│   │   │   ├── consents/             # Consent forms
│   │   │   └── ...
│   │   ├── admin/                    # SuperAdmin control panel
│   │   │   ├── tenants/              # Tenant management
│   │   │   ├── audit-logs/           # Audit trail viewer
│   │   │   └── ...
│   │   ├── api/                      # API routes (40+)
│   │   │   ├── auth/                 # NextAuth routes
│   │   │   ├── patients/             # CRUD endpoints
│   │   │   ├── appointments/         # Scheduling endpoints
│   │   │   ├── sessions/             # Clinical notes endpoints
│   │   │   ├── charges/              # Billing endpoints
│   │   │   ├── patient-portal/       # Portal API
│   │   │   ├── admin/                # SuperAdmin endpoints
│   │   │   ├── webhooks/             # Incoming webhooks
│   │   │   └── ...
│   │   ├── middleware.ts             # Request auth, tenant injection
│   │   └── layout.tsx                # Root layout (fonts, metadata)
│   ├── components/                   # React Components (50+)
│   │   ├── ui/                       # UI primitives (Button, Card, etc.)
│   │   ├── patients/                 # Patient-specific components
│   │   ├── appointments/             # Appointment components
│   │   ├── sessions/                 # Session note components
│   │   ├── billing/                  # Billing UI components
│   │   ├── portal/                   # Portal-specific components
│   │   ├── layout/                   # Layout components (Sidebar, Navbar)
│   │   └── ...
│   ├── lib/                          # Shared utilities (19 modules)
│   │   ├── auth.ts                   # NextAuth config & helpers
│   │   ├── patient-auth.ts           # Patient auth (PBKDF2, magic links)
│   │   ├── db.ts                     # Prisma client singleton
│   │   ├── logger.ts                 # Audit logging (49 actions)
│   │   ├── encryption.ts             # AES-256-GCM encryption
│   │   ├── rate-limiter.ts           # Upstash Redis + in-memory
│   │   ├── csrf.ts                   # CSRF token validation
│   │   ├── email.ts                  # Resend email service
│   │   ├── file-storage.ts           # S3/R2 file upload
│   │   ├── validators.ts             # Zod schemas
│   │   ├── errors.ts                 # Custom error classes
│   │   ├── middleware-utils.ts       # Request/response helpers
│   │   ├── permissions.ts            # RBAC permission checking
│   │   ├── google-calendar.ts        # Google Calendar sync (stub)
│   │   ├── nfse-integration.ts       # NFSe invoicing (stub)
│   │   ├── timezone.ts               # IANA timezone utilities
│   │   ├── crypto-utils.ts           # Hashing, random tokens
│   │   ├── notification-service.ts   # Push/email notifications
│   │   └── pdf-generator.ts          # SOAP note PDF export
│   ├── prisma/                       # Database schema
│   │   ├── schema.prisma             # All 30+ models + 14+ enums
│   │   └── migrations/               # Database migrations (3 files)
│   ├── types/                        # TypeScript type definitions
│   │   ├── index.ts                  # Main type exports
│   │   ├── auth.ts                   # Auth types
│   │   ├── patient.ts                # Patient types
│   │   ├── appointment.ts            # Appointment types
│   │   └── billing.ts                # Billing types
│   └── styles/                       # Global styles
│       ├── globals.css               # Tailwind directives, CSS vars
│       └── theme.css                 # Design tokens
├── tests/                            # Test suite
│   ├── unit/                         # Jest unit tests (26+ files)
│   │   ├── lib/                      # Library function tests
│   │   ├── utils/                    # Utility function tests
│   │   └── ...
│   ├── integration/                  # Jest integration tests (4+ files)
│   │   ├── api/                      # API route tests
│   │   └── ...
│   └── e2e/                          # Playwright E2E tests (5+ files)
│       ├── auth.spec.ts              # Login/register workflows
│       ├── appointments.spec.ts      # Scheduling workflows
│       └── ...
├── public/                           # Static assets
│   ├── logo.png, icons/*.svg         # Branding assets
│   └── fonts/                        # Web fonts (Inter, Merriweather, etc.)
├── .next/                            # Build output (gitignored)
├── node_modules/                     # Dependencies (gitignored)
├── .env.local                        # Runtime environment variables
├── .env.example                      # Environment template
├── package.json                      # Dependencies, scripts, metadata
├── tsconfig.json                     # TypeScript configuration
├── next.config.js                    # Next.js build & runtime config
├── tailwind.config.ts                # Tailwind CSS setup
├── jest.config.ts                    # Jest configuration
├── playwright.config.ts              # Playwright E2E configuration
├── README.md                         # (Minimal or missing)
└── .gitignore                        # Git ignore rules
```

---

## Key Library Modules (19 Files)

### Authentication & Security
| Module | Purpose | Key Exports | Dependencies |
|--------|---------|-------------|--------------|
| `auth.ts` | NextAuth configuration, session helpers | `getServerSession()`, `getCurrentUser()`, `NextAuth` config | NextAuth, Prisma |
| `patient-auth.ts` | Patient portal auth (PBKDF2, magic links) | `verifyPatientPassword()`, `generateMagicLink()`, `verifyMagicLink()` | Crypto, Prisma |
| `csrf.ts` | Double-submit CSRF token validation | `generateCSRFToken()`, `validateCSRFToken()` | Crypto utils |
| `crypto-utils.ts` | Hashing, token generation, timing-safe comparison | `hashPassword()`, `generateToken()`, `timingSafeEquals()` | `crypto` module |

### Data & Database
| Module | Purpose | Key Exports | Dependencies |
|--------|---------|-------------|--------------|
| `db.ts` | Prisma client singleton | `prisma` (global instance) | Prisma |
| `encryption.ts` | AES-256-GCM encryption/decryption | `encrypt()`, `decrypt()`, key rotation helpers | `crypto` module |
| `validators.ts` | Zod schema definitions for all entities | `createPatientSchema`, `createAppointmentSchema`, etc. | Zod |

### Middleware & Request Handling
| Module | Purpose | Key Exports | Dependencies |
|--------|---------|-------------|--------------|
| `middleware-utils.ts` | Request/response helpers | `extractTenantId()`, `injectTenantHeader()`, error formatters | Next.js types |
| `rate-limiter.ts` | Upstash Redis + in-memory fallback | `checkRateLimit()`, `incrementCounter()` | Upstash SDK, in-memory Map |

### Business Logic
| Module | Purpose | Key Exports | Dependencies |
|--------|---------|-------------|--------------|
| `permissions.ts` | RBAC permission checking | `can()`, `hasRole()`, 27+ permission definitions | Types, enums |
| `logger.ts` | Audit logging (49 actions) | `logAction()`, `formatAuditEntry()`, PHI redaction | Prisma, types |
| `email.ts` | Resend email service wrapper | `sendAppointmentReminder()`, `sendPaymentNotice()`, etc. | Resend SDK |
| `notification-service.ts` | Push/email notifications | `notifyPatient()`, `notifyStaff()`, queue management | Email, types |
| `file-storage.ts` | S3/R2 file upload & validation | `uploadFile()`, `deleteFile()`, magic-byte validation | AWS SDK (or S3-compatible) |

### Integrations & Features
| Module | Purpose | Key Exports | Dependencies |
|--------|---------|-------------|--------------|
| `google-calendar.ts` | Google Calendar sync (stub) | `syncToGoogle()`, `fetchGoogleEvents()` (not implemented) | Google APIs |
| `nfse-integration.ts` | NFSe Brazilian invoicing (stub) | `generateNFSe()`, `submitNFSe()` (not implemented) | HTTP client |
| `timezone.ts` | IANA timezone utilities | `getUserTimezone()`, `convertTimezone()`, recurring rules | date-fns |
| `pdf-generator.ts` | SOAP note PDF export | `generateSessionPDF()`, template formatting | PDFKit or similar |

---

## Naming Conventions

### File & Folder Naming
- **Folders:** `kebab-case` (e.g., `patient-portal`, `api-routes`)
- **Component files:** `PascalCase` (e.g., `PatientForm.tsx`, `AppointmentScheduler.tsx`)
- **Library/utility files:** `kebab-case` (e.g., `rate-limiter.ts`, `crypto-utils.ts`)
- **API route files:** `route.ts` (Next.js convention)
- **Test files:** `*.test.ts`, `*.spec.ts`, `*.e2e.ts`

### Code Identifiers
- **React components:** `PascalCase` (e.g., `function PatientList() {}`)
- **Functions & variables:** `camelCase` (e.g., `generateToken()`, `currentUser`)
- **Constants & enums:** `UPPER_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`, `SESSION_TIMEOUT`)
- **Database models:** `PascalCase` (e.g., `User`, `Patient`, `Appointment`)
- **Enums (Prisma):** `UPPER_SNAKE_CASE` values (e.g., `PENDING`, `COMPLETED`)

### Example Paths
```
src/components/patients/PatientForm.tsx       # Component
src/lib/rate-limiter.ts                       # Library utility
src/app/api/patients/route.ts                 # API endpoint
src/app/(dashboard)/patients/page.tsx         # Page
tests/unit/lib/rate-limiter.test.ts           # Unit test
tests/e2e/auth.spec.ts                        # E2E test
```

---

## Code Patterns & Standards

### 1. Server Components (Default)
All page components use Next.js Server Components by default:

```typescript
// src/app/(dashboard)/patients/page.tsx
export default async function PatientsPage() {
  const patients = await db.patient.findMany({ where: { tenantId } });
  return <PatientList patients={patients} />;
}
```

**Benefits:** Data fetching at render time, no separate API calls, reduced client JS.

### 2. Client Components (Explicit)
Interactive components marked with `'use client'`:

```typescript
// src/components/patients/PatientForm.tsx
'use client';

import { useState } from 'react';

export function PatientForm() {
  const [formData, setFormData] = useState({});
  // Interactive logic here
}
```

**Benefits:** Clear boundary between server/client, hydration controlled.

### 3. Zod Validation
All request bodies validated with Zod schemas:

```typescript
// src/lib/validators.ts
export const createPatientSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email(),
  phone: z.string().optional(),
});

// In API route:
const data = createPatientSchema.parse(await request.json());
```

**Benefits:** Type-safe input, compile-time & runtime validation, error messages.

### 4. Error Handling
Custom error classes for consistent error responses:

```typescript
// src/lib/errors.ts
export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

// In API route:
if (!patient) throw new NotFoundError('Patient not found');

// Caught by error handler:
catch (error) {
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
}
```

**Benefits:** Consistent error shape, predictable HTTP status codes, easier testing.

### 5. Multi-Tenancy Pattern
Every database query includes `tenantId` filter:

```typescript
// Implicit via middleware:
const tenantId = headers().get('x-tenant-id');

// In queries:
await db.patient.findMany({
  where: { tenantId, /* other filters */ }
});

// Enforced in route handlers:
const session = await getServerSession();
const tenantId = session.user.tenantId;
```

**Benefits:** Data isolation, prevents cross-tenant leaks, multi-SaaS support.

### 6. Soft-Delete Pattern
Deleted records marked with `deletedAt` timestamp:

```typescript
// Schema:
model Patient {
  id String @id @default(cuid())
  deletedAt DateTime?
}

// Queries:
where: { tenantId, deletedAt: null }

// Retention: 30 days before hard delete via cron job
```

**Benefits:** Data recovery, audit trail preservation, GDPR compliance (right to be forgotten with retention period).

### 7. Session & Auth
JWT sessions via NextAuth (staff) + custom PBKDF2 (patients):

```typescript
// Staff session:
const session = await getServerSession();
const user = session.user; // { id, email, role, tenantId }

// Patient session (portal):
const patientSession = await getPatientSession(request);
const patient = patientSession.patient; // { id, name, tenantId }
```

**Benefits:** Stateless, Edge-compatible (Vercel), no database session lookups.

### 8. API Response Format
Consistent JSON response shape:

```typescript
// Success:
{ data: { /* payload */ }, status: 200 }

// Error:
{ error: { code: 'VALIDATION_ERROR', message: '...' }, status: 400 }
```

**Benefits:** Predictable client-side handling, clear data vs. meta separation.

---

## Build, Lint & Test Commands

### Development
```bash
npm run dev                    # Start Next.js dev server (localhost:3000)
npm run dev:turbo            # With Turbo (if configured)
```

### Building & Type Checking
```bash
npm run build                 # Next.js build (next build)
npm run type-check           # TypeScript check (tsc --noEmit)
npm run lint                 # ESLint + Prettier (next lint)
```

### Testing
```bash
npm run test                 # Jest unit + integration tests
npm run test:watch           # Jest watch mode
npm run test:coverage        # Coverage report
npm run test:e2e             # Playwright E2E (headless)
npm run test:e2e:ui          # Playwright E2E (UI mode for debugging)
```

### Database
```bash
npm run db:migrate           # Prisma migration (development)
npm run db:push              # Prisma push schema (development)
npm run db:seed              # Seed database (if seed.ts exists)
npm run db:studio            # Prisma Studio (database GUI)
```

### CI/CD (GitHub Actions)
Runs on every push:
1. **Lint:** `npm run lint`
2. **Type check:** `npm run type-check`
3. **Unit tests:** `npm run test` (jest)
4. **E2E tests:** `npm run test:e2e` (playwright on main branch only)
5. **Build:** `npm run build`
6. **Deploy:** Vercel auto-deploy on main

---

## Architectural Principles

### 1. Separation of Concerns
- **Pages** (`src/app/*/page.tsx`) — Data fetching & page layout only
- **Components** (`src/components/`) — Isolated UI logic
- **Routes** (`src/app/api/*/route.ts`) — Request handling & validation
- **Services** (`src/lib/`) — Business logic & integrations
- **Database** (`src/prisma/`) — Data models & queries

### 2. Type Safety
- Strict TypeScript configuration (`tsconfig.json`)
- Zod schemas for runtime validation
- Generated Prisma types from schema
- No `any` types (except where explicitly necessary)

### 3. Security by Default
- CSRF tokens on form submissions
- Rate limiting on sensitive endpoints
- Encryption at rest (AES-256-GCM)
- Content Security Policy (CSP) with nonces
- PBKDF2 password hashing (600k iterations)
- Timing-safe password comparison

### 4. Scalability
- Serverless deployment (Vercel Functions)
- Stateless sessions (JWT)
- Database queries optimized (indexes on tenantId, common filters)
- Edge-compatible middleware (no heavy dependencies)
- Redis-based rate limiting (scales beyond single server)

### 5. Observability
- Audit logging (49 tracked actions)
- Structured error responses
- Console logging in development
- PHI redaction in logs (no sensitive patient data)

---

## Common Development Workflows

### Adding a New Feature
1. Create Prisma model(s) in `schema.prisma`
2. Run `npm run db:migrate` to create migration
3. Create API route in `src/app/api/[domain]/route.ts`
4. Add Zod validator in `src/lib/validators.ts`
5. Create React component in `src/components/[domain]/`
6. Add page in `src/app/(dashboard)/[domain]/page.tsx`
7. Write unit tests in `tests/unit/`
8. Write E2E tests in `tests/e2e/` (for main branch)
9. Push to GitHub → CI runs → auto-deploy to Vercel

### Debugging
- **Server-side:** Check Vercel Function logs in Vercel dashboard
- **Client-side:** Browser DevTools (F12)
- **Database:** Prisma Studio (`npm run db:studio`)
- **API:** Postman or curl with session cookies
- **E2E:** `npm run test:e2e:ui` for step-by-step replay

### Database Schema Changes
1. Edit `src/prisma/schema.prisma`
2. Run `npm run db:migrate` (creates new migration file)
3. Review `prisma/migrations/[timestamp]_[name]/migration.sql`
4. Test locally with dev database
5. Push to GitHub → Vercel deploys → apply migration in Supabase console (manual approval required)

---

## Summary

**Psycologger is a modern, type-safe Next.js application following server-first patterns, strict validation, and multi-tenancy by design.** The codebase is well-organized (lib, components, pages, api separated), uses consistent naming conventions, and enforces security at every layer. Development is fast with hot reload, testing is comprehensive (unit/integration/E2E), and deployment is automated via GitHub Actions + Vercel.

---

**Last Updated:** 2026-04-04
