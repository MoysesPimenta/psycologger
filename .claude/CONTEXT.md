# Psycologger Codebase Context

---

# ═══════════════════════════════════════════════════════════════
# MANDATORY UPDATE RULES — READ BEFORE ANY WORK
# ═══════════════════════════════════════════════════════════════

This file is the SINGLE SOURCE OF TRUTH for the Psycologger
codebase. It MUST be kept accurate at all times.

## WHEN TO UPDATE:

1. After adding/removing/renaming any file
2. After adding/removing any API endpoint
3. After changing the Prisma schema (models, enums, fields)
4. After modifying RBAC permissions or roles
5. After changing the payment/charge flow
6. After adding/removing environment variables
7. After fixing any bug (add to Known Issues → Resolved)
8. After adding any new feature
9. After changing authentication or middleware logic
10. After modifying any lib/ utility

## HOW TO UPDATE:

- Update the relevant section(s) immediately after the change
- Keep descriptions concise but accurate
- Include the date of the change
- If a section becomes inaccurate, the ENTIRE context is suspect

## WHEN TO READ:

- At the START of every new conversation/session
- Before making changes to any file
- Before creating any new file
- When debugging any issue

# ═══════════════════════════════════════════════════════════════

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Data Model](#data-model)
4. [Enums](#enums)
5. [Authentication Flow](#authentication-flow)
6. [Multi-Tenancy](#multi-tenancy)
7. [RBAC (Role-Based Access Control)](#rbac-role-based-access-control)
8. [API Patterns](#api-patterns)
9. [Payment & Charge Flow](#payment--charge-flow)
10. [File Structure](#file-structure)
11. [Key Files](#key-files)
12. [Environment Variables](#environment-variables)
13. [Testing](#testing)
14. [Common Pitfalls](#common-pitfalls)
15. [Resolved Bugs](#resolved-bugs)
16. [Deployment](#deployment)

---

## Project Overview

**Psycologger** is a multi-tenant clinical practice management system for psychologists in Brazil.

### Tech Stack:

- **Frontend & API**: Next.js 14 with App Router (TypeScript)
- **Database**: Supabase (PostgreSQL) with Prisma ORM
- **Authentication**: NextAuth.js with magic link (email) strategy
- **Session Strategy**: JWT (required for Vercel Edge middleware compatibility)
- **UI Framework**: React 18 with Tailwind CSS + Radix UI components
- **Email**: Resend (transactional emails)
- **File Storage**: Cloudflare R2 or AWS S3 (optional)
- **Encryption**: libsodium-wrappers (secretbox for sensitive data)
- **Deployment**: Vercel (serverless) + Supabase (managed database)
- **Testing**: Jest (unit/integration), Playwright (e2e)

### Key Features:

- Multi-tenant architecture with isolated data per tenant
- Role-based access control (SUPERADMIN, TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY)
- Patient management with clinical session notes (EMR)
- Appointment scheduling with Google Calendar integration
- Financial management (charges, payments, partial payment tracking via "Saldo restante")
- NFSe invoice integration (Brazilian electronic invoicing)
- Audit logging with PHI redaction
- Encryption of integration credentials

### Deployment:

- **Production**: git push → GitHub → Vercel auto-deploys
- **Database**: Supabase hosted PostgreSQL
- **Project IDs**: Check .vercel/project.json and Supabase console

---

## Architecture

### Request Flow:

1. **Client** → HTTP request to Next.js
2. **Middleware** (`src/middleware.ts`) → Auth check, tenant header injection
3. **API Route** or **Page** → `getAuthContext()` → Fetch session + membership
4. **RBAC Check** → `requirePermission()` to gate features
5. **Database** → Prisma queries with tenant isolation
6. **Response** → Standardized JSON (see API Patterns)

### Next.js Structure:

- **App Router** (not Pages Router): `src/app/`
- **Server Components** (default): Use `getAuthContext()` directly
- **Client Components**: Call API routes; pass auth context via props or context
- **API Routes**: `src/app/api/v1/[resource]/route.ts` pattern
- **Static Pages**: `src/app/[resource]/page.tsx`

### Middleware Flow:

- **File**: `src/middleware.ts`
- **Job**:
  - Verify JWT token (NextAuth withAuth)
  - Check if SuperAdmin accessing `/sa/*` routes
  - Extract `psycologger-tenant` cookie → inject `x-tenant-id` header
  - Set security headers
  - Protect `/app/*` routes (require session)

### Server vs Client:

- **Server Components**: Can query DB directly, handle auth context, no JS sent to client
- **Client Components**: "use client" directive; call API routes; safe for user interaction
- **API Routes**: Handle requests, enforce RBAC, return JSON

---

## Data Model

### Core Tables:

#### **User**
- PK: `id` (UUID)
- Email: `email` (unique)
- `name`, `phone`, `image` (avatar URL)
- `isSuperAdmin` (Boolean) — platform-wide superuser flag
- `lastLoginAt` — tracks last login timestamp
- Relations:
  - `memberships` → Membership[] (many tenants)
  - `patientsPrimary` → Patient[] (assigned provider)
  - `appointmentsAsProvider` → Appointment[]
  - `chargesAsProvider` → Charge[]
  - `createdPayments` → Payment[] (payment creator)
  - `auditLogs` → AuditLog[]
  - `googleCalendarIntegration` → GoogleCalendarToken?

#### **Tenant**
- PK: `id` (UUID)
- `name` (clinic name), `slug` (URL-safe, unique)
- `timezone` (default: "America/Sao_Paulo"), `locale` (default: "pt-BR")
- Billing info: `cnpj`, `cpf`, address fields (for NFSe)
- Feature flags:
  - `sharedPatientPool` (PSYCHOLOGIST can see all patients if true)
  - `adminCanViewClinical` (TENANT_ADMIN can access clinical notes)
  - `calendarShowPatient` (enum: NONE, FIRST_NAME, FULL_NAME)
- Appointment defaults: `defaultAppointmentDurationMin`, `workingHoursStart`, `workingHoursEnd`, `workingDays`
- `plan` (default: "beta"), `planSince`
- Relations: `memberships`, `patients`, `appointments`, `clinicalSessions`, `charges`, `payments`, `auditLogs`, etc.

#### **Membership**
- PK: `id` (UUID)
- FK: `tenantId`, `userId` (unique pair)
- `role` (Role enum): SUPERADMIN, TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY
- `status` (MembershipStatus): ACTIVE, INVITED, SUSPENDED
- Per-membership overrides (nullable):
  - `canViewAllPatients` (null = use tenant.sharedPatientPool)
  - `canViewClinicalNotes` (null = use tenant.adminCanViewClinical for TENANT_ADMIN)
  - `canManageFinancials` (null = use role default)
- Relations: Tenant, User

#### **Patient**
- PK: `id` (UUID)
- FK: `tenantId`, `assignedUserId` (nullable — primary provider)
- `fullName`, `preferredName`, `email`, `phone`, `dob` (DOB as DATE)
- `cpf` (Brazilian tax ID — sensitive PII)
- `tags` (String[]) — free-form labels
- Status: `isActive` (Boolean), `archivedAt`, `archivedBy`
- Consent: `consentGiven` (Boolean), `consentGivenAt`, `consentFileId`
- Billing defaults:
  - `defaultAppointmentTypeId` (links to default billing type)
  - `defaultFeeOverrideCents` (overrides appointment type's price)
- Relations: `assignedUser`, `contacts`, `appointments`, `clinicalSessions`, `charges`

#### **PatientContact**
- PK: `id` (UUID)
- FK: `tenantId`, `patientId`
- `type` (String): EMERGENCY, RESPONSIBLE, OTHER
- `name`, `phone`, `email`

#### **Appointment**
- PK: `id` (UUID)
- FK: `tenantId`, `patientId`, `providerUserId`, `appointmentTypeId`, `recurrenceId` (nullable)
- `startsAt`, `endsAt` (DateTime)
- `status` (AppointmentStatus): SCHEDULED, CONFIRMED, COMPLETED, CANCELED, NO_SHOW
- `location`, `videoLink` (nullable)
- `adminNotes` (nullable, non-clinical)
- Google Calendar: `googleCalendarEventId`, `googleCalendarSynced`
- Relations: `patient`, `provider`, `appointmentType`, `recurrence`, `clinicalSession` (1:1), `charges`, `reminderLogs`

#### **AppointmentType**
- PK: `id` (UUID)
- FK: `tenantId`
- `name`, `sessionType` (IN_PERSON, ONLINE, EVALUATION, GROUP)
- `defaultDurationMin`, `defaultPriceCents`, `currency`
- `color` (hex for calendar display)
- `isActive` (Boolean)

#### **ClinicalSession**
- PK: `id` (UUID)
- FK: `tenantId`, `patientId`, `providerUserId`, `appointmentId` (nullable, unique)
- `templateKey` (String): FREE, SOAP, BIRP
- `noteText` (full text, access-controlled by RBAC)
- `tags` (String[])
- `sessionDate` (DateTime)
- Soft-delete: `deletedAt`, `deletedBy` (hard-deleted after 30 days by job)
- Relations: `appointment` (1:1), `patient`, `provider`, `revisions`, `files`, `charges`

#### **SessionRevision**
- Tracks edits to clinical notes
- `noteText` (previous version)
- `editedById`, `editedAt`

#### **Charge**
- PK: `id` (UUID)
- FK: `tenantId`, `patientId`, `appointmentId` (nullable), `sessionId` (nullable), `providerUserId`
- `amountCents`, `discountCents` (both integers)
- `currency` (default: "BRL")
- `dueDate` (DATE)
- `status` (ChargeStatus): PENDING, PAID, OVERDUE, VOID, REFUNDED
- `description`, `notes`
- Relations: `patient`, `appointment`, `session`, `provider`, `payments`, `nfseInvoice`
- **CRITICAL**: `amountCents - discountCents = netAmount (the actual obligation)`
- **CRITICAL**: Must track `OVERDUE = today > dueDate` (see Common Pitfalls)

#### **Payment**
- PK: `id` (UUID)
- FK: `tenantId`, `chargeId`, `createdById`
- `amountCents` (payment amount, can be partial)
- `method` (PaymentMethod): PIX, CASH, CARD, TRANSFER, INSURANCE, OTHER
- `paidAt` (DateTime, default: now())
- `reference` (optional: transaction ID, receipt number)
- `notes`
- **CRITICAL**: Records ONE payment instance; multiple Payment records for partial payments
- Relation: `charge` (CASCADE delete)

#### **FileObject**
- PK: `id` (UUID)
- FK: `tenantId`, `patientId` (nullable), `sessionId` (nullable), `uploaderId`
- `storageKey` (S3/R2 object key)
- `fileName`, `mimeType`, `sizeBytes`
- `isClinical` (Boolean) — if true, access is restricted to clinical permission holders
- Soft-delete: `deletedAt`, `deletedBy`

#### **Invite**
- PK: `id` (UUID)
- FK: `tenantId`, `sentById` (nullable)
- `email`, `role`, `token` (unique, cuid)
- `expiresAt`, `acceptedAt`
- Used for inviting new users to a tenant before they have an account

#### **AuditLog**
- PK: `id` (UUID)
- FK: `tenantId` (nullable for platform-level), `userId` (nullable), `entityId` (nullable)
- `action` (AuditAction): LOGIN, LOGOUT, PATIENT_CREATE, etc.
- `entity` (String): "Patient", "Appointment", "Charge", etc.
- `summaryJson` (redacted — NO PHI)
- `ipAddress`, `userAgent`
- **CRITICAL**: Audits MUST NOT contain fullName, notes, diagnosis, or any PHI

#### **IntegrationCredential**
- Stores encrypted API credentials for integrations
- `type` (IntegrationType): NFSE, GOOGLE_CALENDAR
- `encryptedJson` (libsodium sealed box, base64)
- `status`: INACTIVE, ACTIVE, ERROR
- `providerName` (e.g., "eNotas")

#### **GoogleCalendarToken**
- Stores encrypted Google OAuth tokens per user
- `userId` (unique)
- `encryptedTokenJson`, `calendarId`, `syncEnabled`

#### **NfseInvoice**
- Represents a Brazilian NFSe (Nota Fiscal de Serviço Eletrônica) invoice
- FK: `chargeId` (1:1 unique)
- `provider` (e.g., "eNotas"), `status` (DRAFT, QUEUED, PROCESSING, ISSUED, FAILED, CANCELED)
- `externalId` (provider's invoice ID)
- `pdfUrl`, `xmlUrl` (generated by provider)
- `issuedAt`, `rawResponseRedacted`

#### **ReminderTemplate & ReminderLog**
- **ReminderTemplate**: `type` (CONFIRMATION, REMINDER_24H, REMINDER_1H, PAYMENT_CREATED, PAYMENT_DUE_24H, PAYMENT_OVERDUE), `subject`, `body`
- **ReminderLog**: Audit trail of appointment reminders sent (EMAIL, SMS, WHATSAPP)
- **PaymentReminderLog**: Audit trail of payment reminders sent — tracks `type` (PAYMENT_CREATED, PAYMENT_DUE_24H, PAYMENT_OVERDUE), `channel`, `recipient`, `status`

#### **Recurrence**
- `rrule` (RFC 5545 string)
- `startsAt`, `endsAt`, `occurrences`
- Links multiple Appointment instances

#### **NextAuth Tables** (required):
- **Account**: OAuth/email provider tokens
- **Session**: Database session storage (not used since JWT is enabled)
- **VerificationToken**: Email verification token storage

---

## Enums

### Role
```
SUPERADMIN      — Platform superuser (full access everywhere)
TENANT_ADMIN    — Tenant administrator (manage users, view all, financial)
PSYCHOLOGIST    — Clinical provider (full clinical/billing access)
ASSISTANT       — Support staff (non-clinical, billing, scheduling)
READONLY        — View-only access (reports, audit logs)
```

### MembershipStatus
```
ACTIVE          — Active member
INVITED         — Invite sent but not accepted
SUSPENDED       — Membership revoked
```

### AppointmentStatus
```
SCHEDULED       — Appointment booked
CONFIRMED       — Patient confirmed attendance
COMPLETED       — Appointment occurred
CANCELED        — Cancelled by user
NO_SHOW         — Patient did not show up
```

### ChargeStatus
```
PENDING         — Unpaid, not yet overdue
PAID            — Fully paid
OVERDUE         — Due date passed (PENDING + today > dueDate)
VOID            — Cancelled/voided
REFUNDED        — Refunded to patient
```

### PaymentMethod
```
PIX             — Brazilian real-time payment
CASH            — Cash payment
CARD            — Credit/debit card
TRANSFER        — Bank transfer
INSURANCE       — Insurance/health plan payment
OTHER           — Other method
```

### IntegrationType
```
NFSE            — Brazilian NFSe invoicing
GOOGLE_CALENDAR — Google Calendar sync
```

### NfseStatus
```
DRAFT           — Not yet submitted
QUEUED          — Awaiting processing
PROCESSING      — Being processed by provider
ISSUED          — Successfully issued
FAILED          — Failed to issue
CANCELED        — Cancelled by user
```

### AppointmentType_SessionType
```
IN_PERSON       — In-office session
ONLINE          — Video/remote session
EVALUATION      — Initial evaluation
GROUP           — Group session
```

### CalendarShowPatient
```
NONE            — Do not show patient name on calendar
FIRST_NAME      — Show first name only
FULL_NAME       — Show full name
```

---

## Authentication Flow

### Strategy: NextAuth.js + JWT (Email Magic Link)

**Why JWT?** Vercel Edge middleware cannot query the database. JWT is self-contained and verified on the edge.

### Sign-In Flow:

1. User enters email on `/login` page
2. **NextAuth Email Provider** sends magic link to email (via Resend)
3. User clicks link → `/api/auth/callback/email?token=...&email=...`
4. NextAuth verifies token, creates `User` in DB if new
5. JWT generated with `user.id` + `isSuperAdmin`
6. Session token stored in HttpOnly cookie
7. Redirected to `/app/dashboard` (or `/onboarding` if new)

### Session Object (Client-Side):

```typescript
session.user = {
  id: string (UUID)
  email: string
  name?: string
  image?: string (avatar URL)
  isSuperAdmin?: boolean
}
```

### JWT Token Payload:

```typescript
token.id = user.id (UUID)
token.isSuperAdmin = user.isSuperAdmin (boolean)
```

### Key Files:

- **src/lib/auth.ts** — NextAuth configuration
  - Email provider with Resend
  - PrismaAdapter (stores sessions/accounts in DB)
  - JWT callbacks: enriches token with isSuperAdmin, updates lastLoginAt
  - Audit logging on sign-in/sign-out
  - Magic link expires in 24 hours
  - Session expires in 30 days

### Important Notes:

- `isSuperAdmin` is read from `User.isSuperAdmin` (database flag, not computed)
- Session/token refresh is automatic (JWT within maxAge)
- Sign-out logs audit event
- SuperAdmin impersonation (via `getAuthContext`) creates platform-level access

---

## Multi-Tenancy

### Tenant Resolution:

1. **Client sets cookie** → `psycologger-tenant` (tenantId UUID)
2. **Middleware reads cookie** → injects `x-tenant-id` header
3. **API route receives header** → `getAuthContext(req)` extracts it
4. **Server-side component** → `getAuthContext()` uses session + header

### Code Pattern:

```typescript
// API route
import { getAuthContext } from "@/lib/tenant";
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req); // reads x-tenant-id header
  // ctx.tenantId is the resolved tenant
  // All queries must filter by tenantId
}

// Server component
const ctx = await getAuthContext(); // no arg, reads session only
// For platform-level (SuperAdmin with no tenantId), ctx.tenantId = ""
```

### Tenant Isolation:

- **Every table with tenantId** must be filtered in queries
- **Indexes on (tenantId, ...)** for performance
- **FK constraints** ensure cascade delete on tenant deletion
- **No cross-tenant queries** — RBAC enforcement in `can()` function
- **Membership table** links users to tenants (enforces active status)

### SuperAdmin Behavior:

- If `isSuperAdmin = true` and no tenantId cookie:
  - `getAuthContext()` returns platform-level context (tenantId = "")
  - Can access `/sa/*` (SuperAdmin UI routes)
  - Cannot see tenant data without impersonating
- If SuperAdmin with tenantId cookie:
  - Treated as normal TENANT_ADMIN
  - Can view all data for that tenant

### Tenant Settings:

- `sharedPatientPool` — if true, PSYCHOLOGIST/ASSISTANT can see all patients (if permission granted)
- `adminCanViewClinical` — if true, TENANT_ADMIN can read clinical notes

---

## RBAC (Role-Based Access Control)

### Authorization Entry Point:

```typescript
import { can, requirePermission, type AuthContext } from "@/lib/rbac";

// Check permission
if (!can(ctx, "patients:viewAll")) {
  // deny
}

// Or throw on failure
requirePermission(ctx, "patients:create");
```

### Roles & Base Permissions:

#### SUPERADMIN
- Full platform access: all permissions
- Can impersonate users via `sa:impersonate`
- Can view/manage all tenants via `sa:viewAllTenants`, `sa:manageTenants`

#### TENANT_ADMIN
- Tenant management: `tenant:view`, `tenant:edit`
- User/member management: `users:invite`, `users:view`, `users:editRole`, `users:suspend`
- All patient/appointment operations: `patients:*`, `appointments:*`
- Financial: `charges:*`, `payments:*`, `reports:*`
- **Conditional**:
  - `sessions:view` — if `membership.canViewClinicalNotes` is true, OR if `tenant.adminCanViewClinical` is true
  - `files:downloadClinical` — same condition

#### PSYCHOLOGIST
- Tenant: `tenant:view`
- Patients: `patients:list`, `patients:create`, `patients:edit`
- Appointments: `appointments:*` (full)
- Clinical: `sessions:*` (full)
- Files: `files:upload`, `files:download`, `files:uploadClinical`, `files:downloadClinical`
- Financial: `charges:*`, `payments:*`, `reports:*`
- **Cannot**: Manage users, view audit logs (unless extended)

#### ASSISTANT
- Patients: `patients:list`, `patients:create`, `patients:edit`
- Appointments: `appointments:*` (full)
- **Cannot**: Clinical notes, clinical files
- Files: `files:upload`, `files:download` (non-clinical only)
- Financial: `charges:*`, `payments:*`

#### READONLY
- Read-only: `patients:list`, `appointments:view`, `charges:view`, `payments:view`, `reports:view`
- Audit: `audit:view`

### Conditional Permissions:

Three permissions have **runtime conditions** (checked in `can()` function):

1. **sessions:view** (TENANT_ADMIN)
   - Check `membership.canViewClinicalNotes` first (override)
   - Fall back to `tenant.adminCanViewClinical`

2. **patients:viewAll** (PSYCHOLOGIST, ASSISTANT, READONLY)
   - Check `membership.canViewAllPatients` first
   - Fall back to `tenant.sharedPatientPool`

3. **files:downloadClinical** (TENANT_ADMIN, ASSISTANT)
   - Same as sessions:view

### Scope Filtering:

```typescript
import { getPatientScope } from "@/lib/rbac";

const scope = getPatientScope(ctx); // "ALL" or "ASSIGNED"
// If "ASSIGNED": filter queries to ctx.userId = assignedUserId
// If "ALL": no patient filter (check permission first)
```

### Data-Level Filtering:

RBAC is **not** enforced at the database level (no RLS policies). Instead, **all API routes must manually filter**:

```typescript
const where = {
  tenantId: ctx.tenantId, // ALWAYS
  ...(ctx.role === "PSYCHOLOGIST" && { providerUserId: ctx.userId }),
  // more filters
};
```

---

## API Patterns

### Standard Response Format:

**Success (200/201):**
```json
{
  "data": {
    "id": "...",
    // resource fields
  },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "hasMore": true
  }
}
```

**Error (4xx/5xx):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {
      "fieldErrors": {
        "amountCents": ["must be positive"]
      }
    }
  }
}
```

### Error Codes:

- `UNAUTHORIZED` (401) — No session
- `FORBIDDEN` (403) — Permission denied
- `VALIDATION_ERROR` (400) — Zod validation failed
- `BAD_REQUEST` (400) — Invalid state (e.g., charge already paid)
- `NOT_FOUND` (404) — Resource not found
- `CONFLICT` (409) — Constraint violation
- `INTERNAL_ERROR` (500) — Unhandled exception

### Helper Functions:

```typescript
import { ok, created, noContent, apiError, handleApiError } from "@/lib/api";

// Responses
return ok(data, meta);           // 200
return created(data);             // 201
return noContent();               // 204
return apiError("CODE", "msg", 400);

// Error handling
try { ... } catch (err) {
  return handleApiError(err);     // Auto-maps to HTTP response
}

// Pagination
const pagination = parsePagination(searchParams);
// { page, pageSize, skip }
const meta = buildMeta(total, pagination);
```

### Validation:

```typescript
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  amountCents: z.number().int().positive(),
});

const body = schema.parse(await req.json());
// Throws ZodError if invalid → handleApiError converts to 400
```

### All API Routes MUST:

1. Call `getAuthContext(req)`
2. Call `requirePermission(ctx, "permission:name")`
3. Extract request meta: `extractRequestMeta(req)`
4. Log audit event
5. Validate input with Zod
6. Filter queries by `tenantId: ctx.tenantId`
7. Return standardized response

---

## Payment & Charge Flow

### Critical Concept: "Saldo Restante" (Remainder Balance)

When a patient makes a **partial payment** on a charge:
1. Original charge's remaining balance is calculated
2. **New charge** created for the remainder
3. **Original charge marked PAID** (obligation closed)
4. Patient pays the remainder charge next

This design makes partial payments atomic and prevents accounting issues.

### Charge Structure:

```typescript
interface Charge {
  amountCents: number;        // Original amount
  discountCents: number;      // Applied discount
  netAmount = amountCents - discountCents;  // Actual obligation
}

// Payments are separate records
interface Payment {
  amountCents: number;        // ONE payment instance
  chargeId: string;           // Which charge
}

// To get paid amount:
const paidAmountCents = charge.payments.reduce((s, p) => s + p.amountCents, 0);
const remaining = netAmount - paidAmountCents;
```

### Complete Payment Flow:

#### 1. Create Charge (POST /api/v1/charges)

```typescript
POST /api/v1/charges
{
  "patientId": "uuid",
  "appointmentId": "uuid",          // optional
  "sessionId": "uuid",              // optional
  "amountCents": 15000,             // R$150.00
  "discountCents": 0,
  "currency": "BRL",
  "dueDate": "2026-04-30",          // ISO date
  "description": "Sessão de 50 min"
}

// Response: Charge created with status = "PENDING"
```

#### 2. Record Full Payment (POST /api/v1/payments)

```typescript
POST /api/v1/payments
{
  "chargeId": "uuid",
  "amountCents": 15000,             // Full amount
  "method": "PIX",
  "paidAt": "2026-03-30T10:30:00Z", // optional
  "reference": "transaction-id",
  "notes": "Received via Pix"
}

// Response:
{
  "payment": { id, amountCents, ... },
  "remainderCharge": null             // null = full payment
}

// State after:
// - Charge: status = "PAID"
// - Payment: recorded
```

#### 3. Record Partial Payment (POST /api/v1/payments)

```typescript
POST /api/v1/payments
{
  "chargeId": "uuid",               // Original charge
  "amountCents": 10000,             // R$100.00 partial
  "method": "PIX"
}

// Calculation:
// netAmount = 15000 - 0 = 15000
// paidAmount = 0 + 10000 = 10000
// remaining = 15000 - 10000 = 5000

// Response:
{
  "payment": { id, amountCents: 10000, ... },
  "remainderCharge": {
    id: "new-uuid",
    patientId: "...",
    appointmentId: "...",
    amountCents: 5000,
    discountCents: 0,
    description: "Saldo restante",
    dueDate: "2026-04-30",            // From original or explicit remainderDueDate
    status: "PENDING"
  }
}

// State after (atomic transaction):
// - Payment: recorded (10000)
// - Original Charge: status = "PAID" (obligation closed)
// - Remainder Charge: status = "PENDING" (new obligation)
```

#### 4. Overpayment Guard

If `amountCents > remaining`:
```
POST /api/v1/payments
{
  "chargeId": "uuid",
  "amountCents": 20000             // More than owing
}

// Error 400:
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Valor do pagamento (R$ 200.00) excede o saldo restante (R$ 150.00)."
  }
}
```

### Status Transitions:

```
PENDING
  ├─→ (payment received, full) PAID
  ├─→ (payment received, partial) PAID (original) + PENDING (remainder)
  ├─→ (due date passed, not auto-flipped) → "OVERDUE" (GET adds OR filter)
  ├─→ VOID (cancelled)
  └─→ REFUNDED (refunded)

PAID
  └─→ Cannot receive new payment (guard in code)

OVERDUE
  └─→ Same as PAID (cannot pay)

VOID / REFUNDED
  └─→ Terminal states
```

### OVERDUE Determination:

**Important**: Charges are NOT automatically flipped to OVERDUE by a cron job. Instead:

```typescript
// When querying for OVERDUE status:
const statusFilter =
  status === "OVERDUE"
    ? {
        OR: [
          { status: "OVERDUE" },         // Already marked
          { status: "PENDING", dueDate: { lt: today } }  // Logically overdue
        ]
      }
    : { status };

// This is in src/app/api/v1/charges/route.ts (GET)
```

### Key Invariants:

1. **Charge.netAmount = amountCents - discountCents** (immutable once created)
2. **Sum of Payment.amountCents ≤ Charge.netAmount** (guarded in payments route)
3. **Only PENDING charges accept new payments** (checked in code)
4. **Partial payment creates NEW charge** (atomic transaction)
5. **Original charge marked PAID after partial** (closes obligation)
6. **remainderDueDate defaults to original.dueDate** (can override)
7. **Audit logged on every payment** (with remainderChargeId if applicable)

---

## File Structure

```
Psycologger/
├── .claude/
│   └── CONTEXT.md                    [YOU ARE HERE]
├── .env.example                      [Template; see Environment Variables]
├── prisma/
│   └── schema.prisma                 [Prisma schema; CRITICAL — update CONTEXT when modified]
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/                [Public sign-in page]
│   │   │   ├── invite/[token]/       [Public invite acceptance]
│   │   │   └── signup/               [Public sign-up (if enabled)]
│   │   ├── (public)/
│   │   │   ├── pricing/              [Public pricing page]
│   │   │   └── page.tsx              [Landing page]
│   │   ├── app/                      [Protected routes, require auth]
│   │   │   ├── dashboard/            [Main dashboard]
│   │   │   ├── patients/             [Patient list/CRUD]
│   │   │   ├── appointments/         [Calendar/scheduling]
│   │   │   ├── sessions/             [Clinical notes/EMR]
│   │   │   ├── charges/              [Financial charges]
│   │   │   ├── payments/             [Payment recording]
│   │   │   ├── settings/             [Tenant/user settings]
│   │   │   ├── reports/              [Analytics/exports]
│   │   │   └── integrations/         [NFSe, Google Calendar setup]
│   │   ├── sa/                       [SuperAdmin routes, require isSuperAdmin]
│   │   │   ├── login/                [SuperAdmin login]
│   │   │   ├── dashboard/            [SuperAdmin dashboard]
│   │   │   ├── tenants/              [Tenant management]
│   │   │   └── users/                [User management]
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/   [NextAuth OAuth callbacks]
│   │   │   └── v1/                   [Versioned API routes]
│   │   │       ├── patients/         [GET, POST, PATCH, DELETE]
│   │   │       ├── appointments/     [GET, POST, PATCH]
│   │   │       ├── sessions/         [GET, POST, PATCH, DELETE]
│   │   │       ├── charges/          [GET, POST, PATCH]
│   │   │       ├── payments/         [POST]
│   │   │       ├── files/            [GET, POST, DELETE]
│   │   │       ├── audit/            [GET]
│   │   │       └── ...               [Other resources]
│   │   └── layout.tsx                [Root layout]
│   ├── components/
│   │   ├── ui/                       [Radix/Tailwind components]
│   │   ├── forms/                    [React Hook Form forms]
│   │   └── ...                       [Feature components]
│   ├── hooks/
│   │   └── ...                       [Custom React hooks]
│   ├── lib/
│   │   ├── api.ts                    [API response helpers, error handling]
│   │   ├── audit.ts                  [Audit logging with PHI redaction]
│   │   ├── auth.ts                   [NextAuth configuration]
│   │   ├── crypto.ts                 [Encryption/decryption (libsodium)]
│   │   ├── db.ts                     [Prisma singleton]
│   │   ├── email.ts                  [Email templates (Resend)]
│   │   ├── rbac.ts                   [Role-based access control]
│   │   ├── storage.ts                [File upload (S3/R2)]
│   │   ├── tenant.ts                 [Tenant/auth context resolution]
│   │   └── utils.ts                  [Date, currency, slug formatting]
│   ├── middleware.ts                 [Request middleware (auth, tenant inject)]
│   └── types/
│       └── next-auth.d.ts            [NextAuth type extensions]
├── tests/
│   ├── unit/                         [Jest unit tests]
│   └── integration/                  [Jest integration tests (need DB)]
├── package.json                      [Dependencies, scripts]
├── jest.config.js                    [Jest configuration]
├── jest.esbuild-transform.js         [Jest TypeScript transform]
├── next.config.mjs                   [Next.js configuration]
├── tsconfig.json                     [TypeScript configuration]
├── tailwind.config.ts                [Tailwind CSS configuration]
├── postcss.config.mjs                [PostCSS configuration]
├── playwright.config.ts              [Playwright e2e test config]
├── docker-compose.yml                [Local DB (Supabase)]
├── Dockerfile                        [Docker image]
├── README.md                         [Project overview]
├── ROADMAP.md                        [Feature roadmap]
└── .vercel/project.json              [Vercel project metadata]
```

---

## Key Files

### Critical Library Files:

#### src/lib/api.ts
- **Purpose**: Standardized API response shapes and error handling
- **Key Functions**:
  - `ok(data, meta)` → 200 response
  - `created(data)` → 201 response
  - `apiError(code, msg, status)` → error response
  - `handleApiError(err)` → auto-routes exceptions to HTTP
  - `parsePagination(searchParams)` → extracts page/pageSize
  - `buildMeta(total, pagination)` → builds meta object
- **Error Classes**: NotFoundError, ConflictError, BadRequestError

#### src/lib/rbac.ts
- **Purpose**: Role-based access control
- **Key Functions**:
  - `can(ctx, permission)` → boolean check
  - `requirePermission(ctx, permission)` → throw if denied
  - `getPatientScope(ctx)` → "ALL" or "ASSIGNED"
- **AuthContext**: userId, role, tenantId, membership, tenant, isSuperAdmin
- **Permissions**: 60+ granular permissions across resources

#### src/lib/auth.ts
- **Purpose**: NextAuth configuration
- **Key Settings**:
  - Email provider with Resend
  - JWT strategy (required for Edge middleware)
  - PrismaAdapter for user/session storage
  - Magic link expiry: 24 hours
  - Session expiry: 30 days
  - JWT callbacks enrich token with isSuperAdmin, update lastLoginAt
  - Audit events on sign-in/out

#### src/lib/tenant.ts
- **Purpose**: Tenant and auth context resolution
- **Key Functions**:
  - `getAuthContext(tenantIdOrRequest)` → resolves full AuthContext
    - Accepts optional tenantId string OR NextRequest (reads x-tenant-id header)
    - Throws UnauthorizedError if no session
    - Throws ForbiddenError if no active membership
  - `getUserMemberships(userId)` → tenant switcher data
  - `getTenantBySlug(slug)` → lookup tenant by slug
- **SuperAdmin Behavior**: If isSuperAdmin + no tenantId, returns platform context

#### src/lib/rbac.ts (RBAC Details)
See RBAC section above for complete permission matrix

#### src/lib/audit.ts
- **Purpose**: Audit logging with PHI redaction
- **Key Function**: `auditLog(params)` → logs action with redaction
- **Redacted Fields**: noteText, fullName, email, phone, cpf, dob, diagnosis, medication
- **AuditAction**: 50+ actions (LOGIN, PATIENT_CREATE, SESSION_UPDATE, etc.)
- **Non-Blocking**: Failures silently caught (never crash main request)

#### src/lib/crypto.ts
- **Purpose**: Encryption/decryption for integration credentials
- **Key Functions**:
  - `encrypt(plaintext)` → base64-encoded nonce+ciphertext
  - `decrypt(encrypted)` → plaintext
  - `encryptJson(obj)`, `decryptJson(encrypted)` → JSON helpers
  - `generateKey()` → 32-byte random key (base64)
  - `maskSecret(secret)` → hides sensitive strings for display
- **Algorithm**: libsodium secretbox (XChaCha20-Poly1305)
- **Key Source**: ENCRYPTION_KEY env var (must be 32 bytes, base64)

#### src/lib/db.ts
- **Purpose**: Prisma singleton
- **Setup**: Global singleton pattern for dev (avoids connection exhaustion)

#### src/lib/utils.ts
- **Purpose**: Formatting and utility functions
- **Key Functions**:
  - `formatDate(date, fmt)`, `formatDateTime`, `formatTime` → date-fns with pt-BR locale
  - `formatCurrency(cents)` → Brazilian currency format (R$)
  - `slugify(text)`, `generateSlug(name)` → URL-safe slugs
  - `toCents(value)`, `fromCents(cents)` → R$ ↔ cents conversion
  - `chargeStatusLabel`, `appointmentStatusLabel`, `paymentMethodLabel`, `roleLabel` → i18n labels
  - `initials(name)` → "John Doe" → "JD"

### Middleware:

#### src/middleware.ts
- **Job**: Auth protection, tenant header injection, security headers
- **Flow**:
  1. `withAuth` wraps middleware (NextAuth)
  2. Checks if SuperAdmin accessing `/sa/*`
  3. Reads `psycologger-tenant` cookie → injects `x-tenant-id` header
  4. Returns request (or redirects if unauthorized)
- **Protected Routes**: `/app/*`, `/sa/*`
- **Public Routes**: `/`, `/login`, `/signup`, `/pricing`, `/invite/*`, `/api/auth/*`

### Example API Route:

#### src/app/api/v1/charges/route.ts
- **GET**: List charges with filters, pagination, OVERDUE logic
- **POST**: Create new charge + sends PAYMENT_CREATED email reminder (fire-and-forget)
- **RBAC Check**: `requirePermission(ctx, "charges:view")`, `requirePermission(ctx, "charges:create")`
- **Query Filters**: tenantId, patientId, provider (if PSYCHOLOGIST), dueDate range, status
- **Pagination**: `parsePagination(searchParams)`, `buildMeta(...)`
- **Audit**: `auditLog(...)` on POST

#### src/app/api/v1/cron/payment-reminders/route.ts
- **POST**: Daily cron (Vercel Cron at 9 AM BRT) for payment reminders
- **Protected by**: `CRON_SECRET` env var (Bearer token)
- **Sends**: PAYMENT_DUE_24H (charges due tomorrow), PAYMENT_OVERDUE (past due, once only)
- **Deduplication**: Checks PaymentReminderLog before sending
- **Auto-status**: Flips PENDING → OVERDUE for past-due charges

#### src/app/api/v1/payments/route.ts
- **POST**: Record payment, handle partial/full payment, create remainder charge
- **CRITICAL**: Atomic transaction (`db.$transaction`)
- **Guards**:
  - Charge must exist and belong to tenant
  - Charge must not be PAID/VOID/REFUNDED
  - Payment cannot exceed remaining balance (overpayment guard)
- **Partial Payment Logic**:
  - Calculate remaining = netAmount - alreadyPaid
  - If payment < remaining → create remainder charge
  - Mark original charge PAID
  - Both in one transaction
- **Remainder Charge Defaults**: dueDate from original or explicit override

---

## Environment Variables

### Database

| Var | Purpose | Example |
|-----|---------|---------|
| `DATABASE_URL` | Supabase transaction pooler (serverless) | `postgresql://...?pgbouncer=true` |
| `DIRECT_URL` | Direct PostgreSQL connection (migrations) | `postgresql://...@db.[project].supabase.co:5432` |

### NextAuth

| Var | Purpose | Example |
|-----|---------|---------|
| `NEXTAUTH_SECRET` | JWT signing key (min 32 chars) | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public app URL (for auth callbacks) | `https://app.psycologger.com` |

### Email (Resend)

| Var | Purpose | Example |
|-----|---------|---------|
| `RESEND_API_KEY` | Resend API key | `re_xxxxx...` |
| `EMAIL_FROM` | From address in transactional emails | `Psycologger <noreply@psycologger.com>` |

### Encryption

| Var | Purpose | Example |
|-----|---------|---------|
| `ENCRYPTION_KEY` | 32-byte base64 key for libsodium | Generated by `generateKey()` |

### Storage (Optional)

| Var | Purpose | Example |
|-----|---------|---------|
| `S3_ENDPOINT` | S3/R2 endpoint | `https://[account].r2.cloudflarestorage.com` |
| `S3_BUCKET` | Bucket name | `psycologger-files` |
| `S3_ACCESS_KEY` | Access key | |
| `S3_SECRET_KEY` | Secret key | |
| `S3_REGION` | Region (R2 uses "auto") | `auto` or `us-east-1` |

### Google Calendar (Optional)

| Var | Purpose | Example |
|-----|---------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | |

### Monitoring (Optional)

| Var | Purpose | Example |
|-----|---------|---------|
| `SENTRY_DSN` | Sentry error tracking | `https://xxx@xxx.ingest.sentry.io/xxx` |

### App

| Var | Purpose | Example |
|-----|---------|---------|
| `NODE_ENV` | Environment | `production` or `development` |

---

## Testing

### Structure:

```
tests/
├── unit/                   — Fast, no DB
│   ├── lib/
│   │   ├── rbac.test.ts
│   │   ├── api.test.ts
│   │   └── utils.test.ts
│   └── ...
└── integration/           — Needs DB (slower)
    ├── api/
    │   ├── charges.test.ts
    │   ├── payments.test.ts
    │   └── ...
    └── ...
```

### Run Tests:

```bash
npm test                   # All tests
npm run test:unit         # Unit only
npm run test:integration  # Integration only
npm run test:ci           # With coverage
npm run test:e2e          # Playwright (app must be running)
```

### Jest Config (jest.config.js):

- **Test Environment**: `node` (not jsdom, since testing server code)
- **Transform**: `jest.esbuild-transform.js` (TypeScript via esbuild)
- **Module Mapper**: `@/` → `src/`
- **Coverage**: Collects from `src/lib/**/*.ts`
- **Test Timeout**: 30 seconds (for integration tests)

### Example Unit Test:

```typescript
// tests/unit/lib/rbac.test.ts
import { can } from "@/lib/rbac";

test("PSYCHOLOGIST can view charges", () => {
  const ctx = {
    userId: "...",
    role: "PSYCHOLOGIST",
    tenantId: "...",
    membership: { ... },
    tenant: { ... },
  };
  expect(can(ctx, "charges:view")).toBe(true);
});
```

### Example Integration Test:

```typescript
// tests/integration/api/charges.test.ts
import { db } from "@/lib/db";

test("POST /api/v1/charges creates charge", async () => {
  const tenant = await db.tenant.create({ data: { ... } });
  const user = await db.user.create({ data: { ... } });
  const response = await POST(req);
  expect(response.status).toBe(201);
});
```

---

## Common Pitfalls

### 1. Prisma Type Staleness

**Problem**: After schema changes, Prisma client cache is stale in VM.

**Symptom**: `Property 'foo' does not exist on type 'Charge'` in TypeScript.

**Fix**: Use `@ts-ignore` in critical paths:
```typescript
// @ts-ignore — stale Prisma client in VM; Vercel regenerates on deploy
const result = await (tx.charge as any).create({ ... });
```

### 2. Timezone Handling

**Problem**: Storing naive DateTime causes timezone mismatches.

**Best Practice**: Always store UTC in DB; format on output using `date-fns-tz`:
```typescript
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const tenantTz = tenant.timezone; // "America/Sao_Paulo"
const displayDate = toZonedTime(utcDate, tenantTz);
const dbDate = fromZonedTime(userInputDate, tenantTz);
```

### 3. Saldo Restante Double-Counting

**Problem**: Remainder charges added to financial totals twice (original + remainder).

**Prevention**:
- Only sum charges with `status !== "PAID"` in financial reports
- Original is marked PAID after remainder created
- Use audit trail to trace remainder creation

### 4. OVERDUE Status Not Auto-Flipped

**Problem**: Cron job doesn't flip PENDING to OVERDUE.

**Solution**: Query-time filter:
```typescript
const statusFilter = status === "OVERDUE"
  ? {
      OR: [
        { status: "OVERDUE" },
        { status: "PENDING", dueDate: { lt: today } }
      ]
    }
  : { status };
```

### 5. Date Filter Object Spread Overwriting

**Problem**: Spreading multiple date filters overwrites previous:
```typescript
// WRONG: to overwrites from
const where = {
  ...(from && { dueDate: { gte: new Date(from) } }),
  ...(to && { dueDate: { lte: new Date(to) } })  // OVERWRITES gte!
};
```

**Fix**: Build filter object once:
```typescript
const dueDate = {};
if (from) dueDate.gte = new Date(from);
if (to) dueDate.lte = new Date(to);
const where = {
  ...(Object.keys(dueDate).length > 0 && { dueDate })
};
```

### 6. Cross-Tenant Queries

**Problem**: Forgetting `tenantId` filter allows data leakage.

**Checklist**: Every query must include:
```typescript
const where = {
  tenantId: ctx.tenantId,  // ALWAYS FIRST
  // ... other filters
};
```

### 7. RBAC Bypass via Missing Permission Check

**Problem**: API route doesn't call `requirePermission()`.

**Checklist**: Every POST/PATCH/DELETE must:
```typescript
const ctx = await getAuthContext(req);
requirePermission(ctx, "resource:action");  // ALWAYS
```

### 8. Audit Logging in Transactions

**Problem**: Audit log fails inside `db.$transaction()` (separate context).

**Pattern**: Log AFTER transaction commits:
```typescript
const { payment } = await db.$transaction(async (tx) => {
  // ... payment logic
});

await auditLog({  // OUTSIDE transaction
  action: "PAYMENT_CREATE",
  entityId: payment.id
});
```

### 9. NextAuth Email Verification Token Expiry

**Problem**: Email magic link expires in 24 hours (hard-coded).

**Implication**: Users must click link within 24 hours or request new link.

**Config**: `src/lib/auth.ts` line 33: `maxAge: 24 * 60 * 60`

### 10. Membership Active Status

**Problem**: Suspended users can still access tenant if membership.status !== "ACTIVE".

**Check**: Always verify in `getAuthContext()`:
```typescript
const membership = await db.membership.findFirst({
  where: {
    userId,
    tenantId,
    status: "ACTIVE"  // CRITICAL: no SUSPENDED/INVITED
  }
});
```

---

## Resolved Bugs

### Bug #1: Double Payment Processing (March 30, 2026)

**Issue**: Partial payments could be recorded twice if form submitted twice.

**Root Cause**: No idempotency key; no duplicate charge prevention in payment route.

**Fix**:
- Added overpayment guard in payments route (line 54-58)
- Guard checks: `amountCents > remaining` → throws BadRequestError
- Payment must not exceed `netAmount - alreadyPaid`

**File**: `src/app/api/v1/payments/route.ts`

### Bug #2: OVERDUE Charges Not Queried Correctly (March 29, 2026)

**Issue**: Charges with dueDate in past but status still PENDING were not returned in OVERDUE queries.

**Root Cause**: No automatic status flip; simple status filter missed logically-overdue charges.

**Fix**:
- Added OR filter in charges GET route (line 43-50)
- When status=OVERDUE queried, returns both `OVERDUE` and `PENDING with dueDate < today`

**File**: `src/app/api/v1/charges/route.ts`

### Bug #3: Stale Prisma Types in Partial Payment Creation (March 28, 2026)

**Issue**: TypeScript error on remainder charge creation inside transaction.

**Root Cause**: Prisma client regenerated on Vercel deploy; VM cache is stale.

**Workaround**: Used `@ts-ignore` + `(tx.charge as any).create(...)`

**File**: `src/app/api/v1/payments/route.ts` line 88

**Note**: This is a VM-specific issue; resolves on production deploy.

### Bug #4: Tenant Timezone Not Respected in Date Filters (March 27, 2026)

**Issue**: Appointment date filters used UTC; missed appointments in tenant's timezone.

**Root Cause**: No `fromZonedTime` conversion on user input before DB query.

**Fix**:
- Require ISO date strings in API input
- Convert user timezone → UTC before storing
- Use date-fns-tz for all timezone conversions

**Recommendation**: Add middleware to auto-convert dates based on tenant.timezone.

### Bug #5: Tenant Isolation Breach in Sessions API (March 31, 2026)

**Issue**: POST /api/v1/sessions accepted any patientId/appointmentId without validating they belong to the current tenant.

**Root Cause**: Missing tenant validation before transaction.

**Fix**:
- Added `db.patient.findFirst({ where: { id, tenantId } })` check before session creation
- Added same check for appointmentId
- Changed `appointment.update` to `appointment.updateMany` with tenantId filter

**File**: `src/app/api/v1/sessions/route.ts`

### Bug #6: Race Condition in Payment Processing (March 31, 2026)

**Issue**: Concurrent payments could both pass balance validation (checked outside transaction).

**Root Cause**: Balance check was outside `db.$transaction`, allowing two requests to read the same state.

**Fix**: Moved charge fetch + balance validation inside the transaction for atomicity.

**File**: `src/app/api/v1/payments/route.ts`

### Bug #7: CSV Formula Injection in Exports (March 31, 2026)

**Issue**: User-supplied data (names, emails) in CSV exports were not escaped, allowing Excel formula injection.

**Fix**: Added `csvSafe()` helper that escapes quotes and prefixes formula-start characters.

**Files**: `src/app/api/v1/reports/route.ts`, `src/app/api/v1/audit/route.ts`

### Bug #8: Cron Timezone Ambiguity (March 31, 2026)

**Issue**: Payment reminder cron used local time constructor, which is ambiguous across server timezones.

**Fix**: Changed to UTC date construction (`Date.UTC()`, `setUTCDate()`).

**File**: `src/app/api/v1/cron/payment-reminders/route.ts`

### Bug #9: Missing SA Pages (March 31, 2026)

**Issue**: /sa/login, /sa/tenants, /sa/users, /sa/impersonate, /sa/tenants/[id] returned 404.

**Fix**: Created all missing pages.

### Bug #10: Missing Legal Pages (March 31, 2026)

**Issue**: /terms and /privacy linked from landing page and login but didn't exist.

**Fix**: Created LGPD-compliant pages, added to middleware public routes.

---

## Deployment

### Development:

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with local values

# Run database migrations
npm run db:migrate

# Start dev server
npm run dev

# In another terminal, open Prisma Studio
npm run db:studio
```

### Production Deployment:

1. **Commit Changes**: `git add .` && `git commit -m "..."`
2. **Push to Main**: `git push origin main`
3. **Vercel Auto-Deploys**: Webhook triggers build
4. **Database Migrations**: Run `prisma migrate deploy` via Vercel build logs
5. **Verify**: Check deployment URL + test critical flows

### Vercel Configuration:

- **Project**: psycologger (production)
- **Git**: Connected to GitHub repo
- **Env Vars**: Set in Vercel dashboard (see Environment Variables section)
- **Build Command**: `next build`
- **Start Command**: `next start`

### Database Migrations:

```bash
# Create migration
npm run db:migrate

# Generate Prisma client
npm run db:generate

# Deploy to production
npm run db:migrate:deploy
```

### Supabase Console:

- **Project URL**: https://supabase.com/
- **Connection Pooling**: Set to "Transaction mode" (required for serverless)
- **Backups**: Automatic daily backups enabled

### Checking Deployment Status:

- **Vercel Dashboard**: vercel.com/psycologger
- **Build Logs**: Check for `prisma migrate deploy` output
- **Error Logs**: Sentry dashboard (if configured)
- **Database**: Supabase console → SQL Editor

---

## Last Updated

- **Date**: March 30, 2026
- **By**: Claude Code Agent
- **Changes**: Initial comprehensive context file created

---

**REMINDER**: This file is the source of truth. Update it whenever the codebase changes.
