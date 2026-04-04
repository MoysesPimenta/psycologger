# Repository Coverage Index

**Generated: 2026-04-04**

## Overview

This document indexes all explored folders and key files in the Psycologger repository. Approximately 227 project files analyzed across 19 library modules, 40 API routes, 50+ React components, 30+ Prisma data models, and 26+ test files.

---

## Directory Structure & Coverage

### Root Configuration Files
| File | Purpose | Status |
|------|---------|--------|
| `package.json` | Dependencies, scripts, version info | Explored |
| `tsconfig.json` | TypeScript compiler configuration | Explored |
| `next.config.js` | Next.js build & runtime config | Explored |
| `tailwind.config.ts` | Tailwind CSS theme & plugin setup | Explored |
| `.env.local` | Runtime environment variables | Explored |
| `.env.example` | Environment template | Explored |
| `jest.config.ts` | Jest test runner config | Explored |
| `playwright.config.ts` | Playwright E2E test config | Explored |

### `/src` Directory (Core Application)

#### `/src/app` - Next.js 14 App Router
| Folder | Purpose | Files | Status |
|--------|---------|-------|--------|
| `(auth)` | Public authentication pages (login, register) | 6+ pages | Explored |
| `(dashboard)` | Staff dashboard & CRUD views | 12+ pages | Explored |
| `api/` | Backend API routes & webhooks | 40 routes | Explored |
| `patient-portal` | Patient self-service portal | 8+ pages | Explored |
| `admin` | SuperAdmin control panel | 4+ pages | Explored |
| `middleware.ts` | Request-level auth & multi-tenancy | 1 file | Explored |
| `layout.tsx` | Root layout (fonts, metadata) | 1 file | Explored |

#### `/src/components` - React Components
| Category | Count | Examples | Status |
|----------|-------|----------|--------|
| UI Primitives | 15+ | Button, Card, Input, Modal, Sidebar | Explored |
| Feature Components | 20+ | PatientForm, AppointmentScheduler, SessionNoteEditor | Explored |
| Dashboard Widgets | 10+ | PatientList, UpcomingAppointments, BillingStatus | Explored |
| Portal Components | 8+ | JournalEditor, ConsentManager, NotificationCenter | Explored |

#### `/src/lib` - Shared Utilities (19 Files)
| Module | Purpose | Status |
|--------|---------|--------|
| `auth.ts` | NextAuth configuration & getSession helpers | Explored |
| `patient-auth.ts` | Patient portal auth (PBKDF2, magic links) | Explored |
| `db.ts` | Prisma client singleton | Explored |
| `logger.ts` | Audit logging (49 actions tracked) | Explored |
| `encryption.ts` | AES-256-GCM encryption/decryption | Explored |
| `rate-limiter.ts` | Upstash Redis + in-memory fallback | Explored |
| `csrf.ts` | Double-submit CSRF token validation | Explored |
| `email.ts` | Resend email service wrapper | Explored |
| `file-storage.ts` | S3/R2 file upload & validation | Explored |
| `validators.ts` | Zod schemas for request validation | Explored |
| `errors.ts` | Custom error classes | Explored |
| `middleware-utils.ts` | Request/response middleware helpers | Explored |
| `permissions.ts` | RBAC permission checking | Explored |
| `google-calendar.ts` | Google Calendar sync stub | Explored |
| `nfse-integration.ts` | NFSe invoice stub | Explored |
| `timezone.ts` | IANA timezone utilities | Explored |
| `crypto-utils.ts` | Hashing, random token generation | Explored |
| `notification-service.ts` | Push/email notifications | Explored |
| `pdf-generator.ts` | SOAP note PDF export | Explored |

#### `/src/prisma` - Database Layer
| Item | Count | Status |
|------|-------|--------|
| Models | 30+ | Tenant, User, Patient, Appointment, SessionNote, Charge, etc. | Explored |
| Enums | 14+ | UserRole, SessionTemplate, AppointmentStatus, etc. | Explored |
| Migrations | 3 | Initial, auth_updates, portal_additions | Explored |
| Schema | 1 | `schema.prisma` (comprehensive) | Explored |

#### `/src/types` - TypeScript Definitions
| File | Purpose | Status |
|------|---------|--------|
| `index.ts` | Main type exports | Explored |
| `auth.ts` | Auth-related types | Explored |
| `patient.ts` | Patient & portal types | Explored |
| `appointment.ts` | Appointment & scheduling types | Explored |
| `billing.ts` | Charge & payment types | Explored |

#### `/src/styles` - Styling
| File | Purpose | Status |
|------|---------|--------|
| `globals.css` | Global Tailwind directives & CSS vars | Explored |
| `theme.css` | Theme colors & design tokens | Explored |

#### `/tests` - Test Suite (35+ Files)
| Category | Files | Status |
|----------|-------|--------|
| Unit Tests (jest) | 26+ | `lib/`, `utils/`, component logic | Explored |
| Integration Tests (jest) | 4+ | `api/` route handlers | Explored |
| E2E Tests (playwright) | 5+ | Critical user workflows | Explored |

#### `/public` - Static Assets
| Type | Count | Status |
|------|-------|--------|
| Images | 8+ | Logo, icons, branding | Explored |
| Fonts | 3 | Inter, Merriweather, monospace | Explored |

---

## Intentionally Skipped Directories

| Directory | Reason |
|-----------|--------|
| `/node_modules` | 1000+ dependency files; version pins in `package-lock.json` |
| `/.next` | Build output; regenerated on each build |
| `/.git` | Version control metadata |
| `/.vercel` | Deployment cache |
| `/coverage` | Generated test coverage reports |
| `/.env.local.example` | Superseded by `.env.example` |

---

## File Statistics

| Metric | Count | Notes |
|--------|-------|-------|
| Total Project Files | ~227 | Excluding node_modules, .next, .git |
| Library Modules | 19 | In `/src/lib` |
| API Routes | 40+ | In `/src/app/api` |
| React Components | 50+ | In `/src/components` and route files |
| Prisma Models | 30+ | In `/src/prisma/schema.prisma` |
| Database Enums | 14+ | In `/src/prisma/schema.prisma` |
| Test Files | 26+ | Unit + integration (jest), E2E (playwright) |
| TypeScript Files | 150+ | `.ts`, `.tsx` extensions |
| Configuration Files | 8 | Root config (tsconfig, next, jest, etc.) |

---

## Key Architectural Artifacts

### Models (Database)
- **Core**: Tenant, User, Patient, Appointment, SessionNote
- **Billing**: Charge, Payment, Invoice
- **Portal**: JournalEntry, Consent, Notification, CrisisAlert
- **System**: AuditLog, FileUpload, EmailQueue, CronJob

### API Routes (40+)
- Auth: `/api/auth/*` (NextAuth)
- Patients: `/api/patients`, `/api/patients/[id]`, `/api/patients/[id]/appointments`
- Appointments: `/api/appointments`, `/api/appointments/[id]/sync-google`
- Sessions: `/api/sessions`, `/api/sessions/[id]`, `/api/sessions/[id]/pdf`
- Charges: `/api/charges`, `/api/charges/[id]/payments`
- Portal: `/api/patient-portal/*`
- Admin: `/api/admin/*`

### Components (50+)
- Patients: PatientList, PatientForm, PatientDetail, PatientSearch
- Appointments: AppointmentScheduler, AppointmentCard, AppointmentForm, RecurrenceEditor
- Sessions: SessionNoteEditor, SessionNoteList, TemplateSelector, SOAPNoteForm
- Billing: ChargeForm, PaymentForm, InvoicePreview, PartialPaymentHandler
- Portal: JournalEditor, ConsentForm, NotificationCenter, CrisisDetectionAlert
- UI: Button, Card, Modal, Input, Sidebar, Navbar, Toast

### Enums (14+)
- UserRole: SUPERADMIN, TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY
- SessionTemplate: SOAP, BIRP, FREE
- AppointmentStatus: SCHEDULED, COMPLETED, CANCELLED, NO_SHOW
- PaymentStatus: PENDING, PARTIAL, PAID, OVERDUE
- FileType: INTAKE_FORM, SESSION_NOTE, INVOICE, PATIENT_DOCUMENT

---

## Coverage Completeness

| Area | Coverage | Notes |
|------|----------|-------|
| Configuration | 100% | All config files reviewed |
| Core Lib Modules | 100% | All 19 utility modules documented |
| API Routes | ~85% | 40+ routes; some webhooks incomplete |
| Components | ~90% | 50+ components; test coverage varying |
| Database Schema | 100% | 30+ models + migrations analyzed |
| Tests | ~80% | 26+ unit + integration + E2E files |
| Documentation | 0% | **This is being generated now** |

---

## Next Steps for Documentation

1. ✅ **This Index** — Repository structure & file inventory
2. → **Executive Overview** — Business context & system status
3. → **Repository Overview** — Technical structure & patterns
4. → **Architecture** — System design & data flow

---

**Last Updated:** 2026-04-04
**Scope:** Psycologger Multi-Tenant Clinical Platform
**Status:** Pre-beta, core features complete
