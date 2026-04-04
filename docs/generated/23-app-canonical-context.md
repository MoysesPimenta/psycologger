# Psycologger: Canonical App Context

**The Single Source of Truth for Understanding Psycologger**

---

## What This App Is

Psycologger is a multi-tenant SaaS clinical practice management platform for Brazilian psychologists. It enables psychologists and clinic staff to manage patients, schedule appointments, document clinical sessions, track payments, and communicate with patients through a secure portal. The platform is built for the Brazilian market (Portuguese pt-BR UI) with compliance for local regulations (CPF tracking, LGPD consent, NFSe invoicing). It is currently in pre-beta maturity and uses Next.js 14 with PostgreSQL, Prisma ORM, NextAuth for staff authentication, and a custom PatientAuth system for secure patient portal access.

---

## Roles & Permissions Matrix

### 5 Core Roles

| Role | Scope | Can Do | Cannot Do |
|------|-------|---------|-----------|
| **SUPERADMIN** | Platform-wide | All operations across all tenants; audit; integration management; user invitations | None (unrestricted) |
| **TENANT_ADMIN** | Single tenant | Manage users & memberships; view/edit tenant settings; view patients; create/edit appointments; manage charges; view audit logs; conditionally view clinical (if adminCanViewClinical=true) | Cannot access other tenants; cannot modify platform settings |
| **PSYCHOLOGIST** | Own patients | Create/edit/view own appointments & sessions; see own patients; upload/download clinical files; create/edit charges; view own reports; see assigned patient data only | Cannot see other psychologists' patients; cannot delete tenant data; cannot manage users |
| **ASSISTANT** | Operational | View patients; create/edit appointments; view/create charges; send reminders | Cannot access clinical sessions/notes; cannot see file content; cannot manage users; cannot delete data |
| **READONLY** | View-only | View patients; view appointments; view charges; view reports | Cannot create/edit/delete anything |

### 27 Permissions Granted by Role

| Permission | SUPERADMIN | TENANT_ADMIN | PSYCHOLOGIST | ASSISTANT | READONLY |
|-----------|-----------|-------------|------------|-----------|----------|
| **Tenant** | | | | | |
| tenant:view | ✓ | ✓ | ✓ | ✓ | ✓ |
| tenant:edit | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Users** | | | | | |
| users:view | ✓ | ✓ | ✗ | ✗ | ✗ |
| users:invite | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Patients** | | | | | |
| patients:list | ✓ | ✓ | ✓ | ✓ | ✓ |
| patients:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| patients:edit | ✓ | ✓ | ✓ | ✓ | ✗ |
| patients:archive | ✓ | ✓ | ✓ | ✗ | ✗ |
| patients:viewAll | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Appointments** | | | | | |
| appointments:view | ✓ | ✓ | ✓ | ✓ | ✓ |
| appointments:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| appointments:edit | ✓ | ✓ | ✓ | ✓ | ✗ |
| **Sessions** | | | | | |
| sessions:view | ✓ | ✓* | ✓ | ✗ | ✗ |
| sessions:create | ✓ | ✓ | ✓ | ✗ | ✗ |
| sessions:edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Charges** | | | | | |
| charges:view | ✓ | ✓ | ✓ | ✓ | ✓ |
| charges:create | ✓ | ✓ | ✓ | ✓ | ✗ |
| charges:edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| charges:void | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Payments** | | | | | |
| payments:create | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Files** | | | | | |
| files:uploadClinical | ✓ | ✓ | ✓ | ✗ | ✗ |
| files:downloadClinical | ✓ | ✓* | ✓ | ✗ | ✗ |
| files:delete | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Reports** | | | | | |
| reports:view | ✓ | ✓ | ✓ | ✗ | ✗ |
| reports:export | ✓ | ✓ | ✓ | ✗ | ✗ |
| **Integrations** | | | | | |
| integrations:manage | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Audit** | | | | | |
| audit:view | ✓ | ✓ | ✗ | ✗ | ✗ |
| audit:export | ✓ | ✓ | ✗ | ✗ | ✗ |

**Legend**: * = Conditional on tenant.adminCanViewClinical flag

---

## Core Domains

### 1. Authentication & Authorization
Psycologger uses a dual-authentication system: **NextAuth** (JWT-based) for staff (psychologists, admins, assistants) and a custom **PatientAuth** system for patient portal access. Staff auth is session-based with refresh tokens; patient auth uses PBKDF2 hashed passwords (600k iterations) and magic link verification. All requests go through middleware that resolves the auth context (tenantId, userId, role) and injects it into the request context. CSRF validation runs on all state-changing requests. Portal sessions use SHA-256 hashed tokens (not JWT) and expire after 30 minutes of inactivity.

### 2. Multi-Tenancy & Data Isolation
Every database query includes a tenantId filter as the root isolation boundary. Users belong to tenants via the Membership model (one user can belong to multiple tenants). Each tenant has one superadmin-designated TENANT_ADMIN. Data belonging to one tenant is never visible to users of another tenant, enforced at the query level. TenantId is resolved from cookies or request headers and cached in middleware.

### 3. Clinical Domain (Appointments, Sessions, Files)
Appointments link a Patient, a Provider (User), an AppointmentType, and optional Recurrence pattern. Appointments can be single or recurring; recurring slots are generated using timezone-aware date math (date-fns-tz) and conflict detection runs inside a database transaction. Clinical sessions document the outcome of appointments, including encrypted notes (via AES-256-GCM). Files can be uploaded to clinical sessions for documents, images, or recordings. Files are stored with magic-byte validation (not just Content-Type) and encrypted at rest.

### 4. Financial Domain (Charges, Payments, Invoicing)
Charges represent billable units linked to appointments or sessions. Payments can be partial (PIX, cash, card, transfer, insurance, other methods). When a payment is less than the charge amount, a remainder charge is automatically created in an atomic transaction. NFSe invoicing is stubbed out (for Brazilian tax compliance). The system tracks payment history and generates payment reminders.

### 5. Patient Portal & Communication
Patients access a separate portal (/portal/*) with their own authentication (magic links or password). The portal shows appointments, charges, and allows journal entries. Journal entries are encrypted and scanned for Portuguese crisis keywords (18 keywords including "suicídio", "me matar"). Patients receive appointment reminders and payment notifications. Consent records track what permissions patients have granted (e.g., video recording, notes sharing).

### 6. Audit & Compliance
Every state-changing operation logs an AuditLog entry with the action, user, tenant, timestamp, and affected entity. PHI fields are automatically redacted in audit summaries (21 sensitive keys). The system supports LGPD compliance through consent tracking and soft-delete with 30-day retention before hard deletion. Audit logs can be exported for regulatory inspection.

### 7. Notifications & Reminders
The system sends transactional emails via Resend (appointment confirmations, reminders, payment notifications). Reminders are customizable per appointment type. Cron jobs trigger reminder emails 24 hours before appointments. Patient notifications track email/SMS status and can be retried.

### 8. Integrations
Google Calendar integration is stubbed (planned). The system stores integration credentials (encrypted) and can sync appointments bidirectionally. NFSe invoicing is stubbed. Future integrations can be added via the integrations endpoint and credential storage.

---

## Architecture Summary

### Technology Stack
- **Framework**: Next.js 14 (App Router) with TypeScript (strict mode)
- **Database**: PostgreSQL (Supabase) with Prisma 5.22 ORM
- **Auth**: NextAuth.js v4 (staff/admin) + custom PatientAuth (patients)
- **Encryption**: Node.js crypto module (AES-256-GCM)
- **Email**: Resend
- **UI**: React + Tailwind CSS + Radix UI (50+ components)
- **Rate Limiting**: Upstash Redis (with in-memory fallback)
- **Hosting**: Vercel (São Paulo region)
- **File Storage**: Local/S3 (TBD)

### Request Flow
1. **Incoming Request** → middleware.ts
2. **Middleware** resolves tenantId from cookie/header, validates CSRF, sets auth context
3. **Route Handler** (src/app/api/v1/*/route.ts) receives request
4. **Handler** calls getAuthContext(), requirePermission(), validates with Zod
5. **Business Logic** executes (queries via Prisma, respects tenantId/userId scoping)
6. **Audit Log** created if state changed
7. **Response** returned via handleApiError() for consistent format

### Data Flow
```
Staff User → NextAuth (JWT) → Middleware → Route Handler → Prisma → PostgreSQL
Patient → PatientAuth (magic link) → Portal Session (hashed token) → Middleware → Route Handler → Prisma → PostgreSQL
Cron Job → System Auth (CRON_SECRET header) → Route Handler → Prisma → PostgreSQL
```

### Database Schema Structure
```
Tenant (root entity)
├── Membership (user ↔ tenant mapping with role)
├── User (staff: psychologists, admins, assistants)
├── Patient (linked to tenant, optionally assigned to User)
├── PatientContact (phone, email, emergency contact for patient)
├── PatientAuth (separate auth for portal)
├── Appointment (patient + user + appointmentType + recurrence)
├── ClinicalSession (outcome of appointment, encrypted notes)
├── Charge (billable unit)
├── Payment (partial payment, links to charge)
├── FileObject (clinical files, encrypted)
├── JournalEntry (patient journal, encrypted)
├── ReminderTemplate (appointment reminder text)
├── AuditLog (all state changes)
└── ... (20+ other models)
```

---

## Route Protection

### Staff Routes (NextAuth JWT)

| Route | Auth Required | Roles Allowed | Scope |
|-------|---------------|---------------|-------|
| `GET /api/v1/profile` | ✓ NextAuth | All staff | Own profile |
| `POST /api/v1/users` | ✓ NextAuth | SUPERADMIN, TENANT_ADMIN | Tenant users |
| `GET /api/v1/patients` | ✓ NextAuth | TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY | PSYCHOLOGIST: own patients only |
| `POST /api/v1/patients` | ✓ NextAuth | TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT | Tenant patients |
| `GET /api/v1/appointments` | ✓ NextAuth | TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY | PSYCHOLOGIST: own appointments |
| `POST /api/v1/appointments` | ✓ NextAuth | TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT | Tenant appointments |
| `GET /api/v1/sessions` | ✓ NextAuth | TENANT_ADMIN*, PSYCHOLOGIST | PSYCHOLOGIST: own sessions |
| `POST /api/v1/sessions` | ✓ NextAuth | TENANT_ADMIN, PSYCHOLOGIST | Tenant sessions |
| `GET /api/v1/charges` | ✓ NextAuth | TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY | PSYCHOLOGIST: own charges |
| `POST /api/v1/payments` | ✓ NextAuth | TENANT_ADMIN | Tenant payments |
| `GET /api/v1/audit` | ✓ NextAuth | SUPERADMIN, TENANT_ADMIN | Tenant audit logs |

### Patient Portal Routes (PatientAuth)

| Route | Auth Required | Audience | Scope |
|-------|---------------|----------|-------|
| `POST /api/v1/portal/auth/signin` | ✗ | Unauthenticated patient | Self |
| `POST /api/v1/portal/auth/magic-link` | ✗ | Unauthenticated patient | Self |
| `GET /api/v1/portal/dashboard` | ✓ PatientAuth | Authenticated patient | Own data |
| `GET /api/v1/portal/appointments` | ✓ PatientAuth | Authenticated patient | Own appointments |
| `GET /api/v1/portal/charges` | ✓ PatientAuth | Authenticated patient | Own charges |
| `POST /api/v1/portal/journal` | ✓ PatientAuth | Authenticated patient | Own journal entries |
| `GET /api/v1/portal/profile` | ✓ PatientAuth | Authenticated patient | Own profile |
| `POST /api/v1/portal/consents` | ✓ PatientAuth | Authenticated patient | Own consents |

### System/Cron Routes

| Route | Auth Required | Trigger | Purpose |
|-------|---------------|---------|---------|
| `POST /api/cron/payment-reminders` | ✓ (CRON_SECRET header) | Vercel Cron | Email payment reminders |
| `POST /api/cron/appointment-reminders` | ✓ (CRON_SECRET header) | Vercel Cron | Email appointment reminders |

---

## Key Models (10 Most Important)

### 1. **Tenant**
The root entity of multi-tenancy. Every piece of data belongs to exactly one tenant.

```
id: String (primary key)
name: String
slug: String
cpf: String (clinic admin CPF)
cnpj: String (optional, clinic CNPJ)
adminCanViewClinical: Boolean (can TENANT_ADMIN see sessions/files?)
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Multi-tenancy boundary; all queries filtered by tenantId

---

### 2. **User**
Staff member (psychologist, admin, assistant). One user can belong to multiple tenants via Membership.

```
id: String (primary key)
email: String
name: String
emailVerified: DateTime
image: String (avatar URL)
isSuperAdmin: Boolean
createdAt: DateTime
updatedAt: DateTime
memberships: Membership[] (user's tenant assignments)
```

**Why**: NextAuth user; linked to Membership for role assignment

---

### 3. **Membership**
Join table linking User ↔ Tenant with role and status.

```
id: String (primary key)
userId: String (foreign key)
tenantId: String (foreign key)
role: Role (SUPERADMIN, TENANT_ADMIN, PSYCHOLOGIST, ASSISTANT, READONLY)
status: MembershipStatus (ACTIVE, INVITED, INACTIVE)
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Enables multi-tenant access; role assignment; permission checking

---

### 4. **Patient**
A patient within a tenant, optionally assigned to a psychologist.

```
id: String (primary key)
tenantId: String (foreign key, multi-tenancy boundary)
name: String
email: String
cpf: String (plaintext — TODO: encrypt)
phone: String
dateOfBirth: DateTime
gender: String
address: String
city: String
state: String
zipCode: String
assignedUserId: String (foreign key to User, optional)
status: String (ACTIVE, INACTIVE, ARCHIVED)
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Core clinical entity; linked to appointments, sessions, charges

---

### 5. **Appointment**
A scheduled appointment between a patient and provider.

```
id: String (primary key)
tenantId: String (foreign key)
patientId: String (foreign key)
userId: String (foreign key to User/provider)
appointmentTypeId: String (foreign key)
startTime: DateTime
endTime: DateTime
status: AppointmentStatus (SCHEDULED, CONFIRMED, COMPLETED, CANCELED, NO_SHOW)
recurrenceId: String (foreign key to Recurrence, optional)
notes: String
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Core scheduling; linked to sessions, charges, and recurring patterns

---

### 6. **ClinicalSession**
Documentation of a completed appointment; includes encrypted clinical notes.

```
id: String (primary key)
tenantId: String (foreign key)
appointmentId: String (foreign key)
patientId: String (foreign key)
userId: String (foreign key to User/provider)
noteText: String (plaintext — TODO: encrypt with AES-256-GCM)
sessionDate: DateTime
duration: Int (minutes)
deletedAt: DateTime (soft delete, 30-day retention)
deletedBy: String (user who deleted)
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Clinical documentation; audit trail; encrypted in future

---

### 7. **Charge**
A billable unit; can be linked to appointment, session, or standalone.

```
id: String (primary key)
tenantId: String (foreign key)
patientId: String (foreign key)
appointmentId: String (optional foreign key)
clinicalSessionId: String (optional foreign key)
description: String
amount: Decimal
status: ChargeStatus (PENDING, PAID, OVERDUE, CANCELED)
dueDate: DateTime
issuedDate: DateTime
nfseId: String (optional, for NFSe invoicing)
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Financial tracking; supports partial payments via Payment table

---

### 8. **Payment**
A payment against a charge; supports partial payments.

```
id: String (primary key)
tenantId: String (foreign key)
chargeId: String (foreign key)
amount: Decimal
method: PaymentMethod (PIX, CASH, CARD, TRANSFER, INSURANCE, OTHER)
status: PaymentStatus (PENDING, COMPLETED, FAILED)
paidAt: DateTime
paymentReference: String (PIX QR code, check number, etc.)
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Payment tracking; enables partial payments with automatic remainder charge creation

---

### 9. **FileObject**
A clinical file (document, image, recording) uploaded to a session.

```
id: String (primary key)
tenantId: String (foreign key)
clinicalSessionId: String (foreign key)
fileName: String
fileType: String (DOCUMENT, IMAGE, RECORDING, OTHER)
mimeType: String
fileSize: Int
storageUrl: String (S3/local path)
fileHash: String (SHA-256 for integrity)
encryptedAt: DateTime (encryption metadata)
deletedAt: DateTime (soft delete, 30-day retention)
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Clinical file management; encrypted at rest; audit trail

---

### 10. **JournalEntry**
A patient journal entry from the portal; encrypted and scanned for crisis keywords.

```
id: String (primary key)
tenantId: String (foreign key)
patientAuthId: String (foreign key to PatientAuth)
entryDate: DateTime
entryType: JournalEntryType (MOOD, REFLECTION, GRATITUDE, CONCERN, OTHER)
noteText: String (encrypted with AES-256-GCM)
visibility: JournalVisibility (PRIVATE, SHARED_WITH_PROVIDER)
crisisKeywordDetected: Boolean
crisisKeywordMatches: String[] (detected keywords for alert)
sharedWithUserIds: String[] (users who can view)
createdAt: DateTime
updatedAt: DateTime
```

**Why**: Patient self-expression; crisis detection; encrypted for privacy

---

## Critical Flows

### Flow 1: Staff Login (NextAuth)
1. User navigates to `/app/login`
2. User enters email
3. NextAuth sends magic link or redirects to provider (Google, GitHub)
4. User verifies email or authenticates with provider
5. NextAuth creates JWT token and stores in httpOnly cookie
6. Middleware extracts tenantId from cookie/header
7. User is redirected to `/app/dashboard`
8. Session is valid for duration in NextAuth config (default: 30 days)

**Key Files**: src/lib/auth.ts, src/middleware.ts, NextAuth config in route handlers

---

### Flow 2: Patient Portal Login (PatientAuth)
1. Patient navigates to `/portal`
2. Patient enters email or phone
3. System sends magic link to email or SMS
4. Patient clicks link, which redirects to `/portal/verify?token=<JWT>`
5. Middleware validates token signature and expiry
6. Session token (32 random bytes, SHA-256 hashed) is created and stored in database
7. Hashed token is set in httpOnly cookie with SameSite=Strict
8. Patient is redirected to `/portal/dashboard`
9. Session expires after 30 minutes of inactivity

**Key Files**: src/lib/patient-auth.ts, src/middleware.ts, src/app/api/v1/portal/auth/route.ts

---

### Flow 3: Creating a Recurring Appointment
1. User calls `POST /api/v1/appointments` with recurrence pattern (freq, interval, until, daysOfWeek, timezone)
2. Handler validates with Zod schema
3. Middleware resolves tenantId and userId
4. Handler calls requirePermission('appointments:create')
5. Handler calculates all recurring slot dates using date-fns-tz (respects timezone)
6. **Inside a Prisma transaction**:
   - Checks for conflicts: existing appointments in same slots for same patient
   - If conflict found, returns 409 Conflict
   - If no conflict, creates appointment for each slot
   - Creates Recurrence record to link them
   - All slots are created atomically
7. Handler creates AuditLog for each appointment
8. Response returns all created appointments
9. If error occurs mid-transaction, entire transaction rolls back

**Key Code**: src/app/api/v1/appointments/route.ts, date-fns-tz for timezone math

---

### Flow 4: Creating a Charge with Partial Payment
1. User creates charge: `POST /api/v1/charges`
   - amount: 500 BRL, patient: P1, appointment: A1
2. Charge is stored with status: PENDING
3. Later, patient makes partial payment: `POST /api/v1/payments`
   - chargeId: C1, amount: 300 BRL, method: PIX
4. Handler validates with Zod
5. Middleware resolves tenantId
6. Handler requires permission('payments:create')
7. **Inside a Prisma transaction**:
   - Finds charge (amount: 500)
   - Confirms payment amount (300) < charge amount (500)
   - Creates Payment record (amount: 300)
   - Calculates remainder: 500 - 300 = 200
   - Creates new Charge (amount: 200, status: PENDING)
   - Updates original Charge: status stays PENDING (because remainder exists) or PARTIALLY_PAID
   - All operations committed atomically
8. AuditLog created for Payment and new Charge
9. Email sent to patient with remainder details

**Key Code**: src/app/api/v1/payments/route.ts

---

### Flow 5: Psychologist Creates and Encrypts Session Notes
1. Psychologist navigates to completed appointment
2. Clicks "Document Session"
3. Enters clinical notes in rich text editor
4. Clicks "Save"
5. `POST /api/v1/sessions` with noteText
6. Handler validates with Zod
7. Middleware resolves tenantId, userId
8. Handler calls requirePermission('sessions:create')
9. Handler **currently stores noteText plaintext** (TODO: encrypt)
10. Session record created with encrypted noteText (future)
11. Files can be uploaded: `POST /api/v1/sessions/{id}/files`
12. Files are encrypted at rest using AES-256-GCM
13. AuditLog created
14. Only the psychologist and TENANT_ADMIN (if adminCanViewClinical=true) can see session

**Key Code**: src/app/api/v1/sessions/route.ts, src/lib/crypto.ts (for future encryption)

---

### Flow 6: Patient Creates Encrypted Journal Entry with Crisis Detection
1. Patient logs into portal
2. Navigates to "My Journal"
3. Clicks "New Entry"
4. Selects entryType (MOOD, REFLECTION, CONCERN, etc.)
5. Writes journal text
6. Clicks "Save"
7. `POST /api/v1/portal/journal` with noteText
8. Handler validates with Zod
9. Middleware resolves patientAuthId
10. Handler requires permission('journal:create')
11. Handler **scans noteText for 18 Portuguese crisis keywords** (e.g., "suicídio", "me matar", "não aguento")
12. Handler **encrypts noteText with AES-256-GCM** using patient's encryption key
13. JournalEntry created with:
    - encrypted noteText
    - crisisKeywordDetected: boolean
    - crisisKeywordMatches: string[]
14. If crisis keyword detected:
    - Alert sent to assigned psychologist
    - Entry marked visible to provider (visibility: SHARED_WITH_PROVIDER)
15. AuditLog created (but encrypted text not shown in audit summary)

**Key Code**: src/app/api/v1/portal/journal/route.ts, src/lib/crypto.ts, crisis keyword list in constants.ts

---

## Sensitive Areas

### Data Classification

| Classification | Data | Encrypted? | Audited? | Scope |
|----------------|------|-----------|----------|-------|
| **PHI (Protected Health Information)** | Clinical session notes, diagnoses, medications, therapy progress | ✗ (should be ✓) | ✓ (redacted) | TenantId + UserId (PSYCHOLOGIST scoped) |
| **PII (Personally Identifiable)** | CPF, name, phone, email, address | ✗ (should be ✓) | ✓ (redacted) | TenantId |
| **Clinical Files** | Documents, images, recordings | ✓ (AES-256-GCM) | ✓ | TenantId + UserId |
| **Journal Entries** | Patient personal reflections | ✓ (AES-256-GCM) | ✓ (redacted) | PatientAuthId |
| **Passwords** | Patient auth | ✓ (PBKDF2) | ✗ | PatientAuthId |
| **Payment Details** | Card last4, PIX reference | ✗ (reference only) | ✓ | TenantId |
| **Audit Logs** | All state changes | ✗ | ✓ | TenantId |

### Encryption Status

| Field | Encrypted? | Method | Status |
|-------|-----------|--------|--------|
| ClinicalSession.noteText | ✗ | — | **TODO** |
| FileObject content | ✓ | AES-256-GCM | Implemented |
| JournalEntry.noteText | ✓ | AES-256-GCM | Implemented |
| Patient.cpf | ✗ | — | **TODO** |
| Patient.email | ✗ | — | (not required) |
| PatientAuth.passwordHash | ✓ | PBKDF2 600k | Implemented |
| PatientPortalSession.hashedToken | ✓ | SHA-256 | Implemented |
| IntegrationCredential.credential | ✓ | AES-256-GCM | Implemented |

### Audit Coverage

| Action | Audited? | PHI Redacted? | Notes |
|--------|----------|---------------|-------|
| Appointment create/edit/delete | ✓ | No (safe) | |
| ClinicalSession create/edit/delete | ✓ | ✓ (noteText omitted) | |
| Charge create/edit/void | ✓ | No (safe) | |
| Payment create | ✓ | No (safe) | |
| File upload/download/delete | ✓ | No (safe, encrypted) | |
| Journal entry create/update | ✓ | ✓ (encrypted in DB, never shown) | |
| User login | ✓ | No (safe) | |
| User invite/permission change | ✓ | No (safe) | |
| Patient data access | ✓ | ✓ (redacted if viewed) | |

### Crisis Detection

Journal entries are automatically scanned for 18 Portuguese crisis keywords:

**Keywords**: "suicídio", "me matar", "morte", "morrer", "não aguento", "não consigo", "cansado de viver", "vida não vale", "acabar comigo", "overdose", "veneno", "arma", "ponte", "pular", "morte súbita", "perdi tudo", "não há esperança", "vou desistir"

**Action on Detection**:
- Entry marked as `crisisKeywordDetected: true`
- Array of matched keywords stored in `crisisKeywordMatches`
- Entry visibility set to `SHARED_WITH_PROVIDER`
- Alert notification sent to assigned psychologist (email + portal notification)
- Psychologist can follow up with patient

---

## Current Status: Implementation vs. Stubbed vs. Missing

### Fully Implemented
- ✓ Multi-tenancy (schema, middleware, queries)
- ✓ RBAC (5 roles, 27 permissions, permission checking)
- ✓ Staff auth (NextAuth JWT)
- ✓ Patient portal auth (PatientAuth, magic links)
- ✓ Appointments (single and recurring with timezone handling)
- ✓ Clinical sessions (documentation)
- ✓ Charges and partial payments (atomic transactions)
- ✓ File upload/download (encrypted)
- ✓ Journal entries (encrypted with crisis detection)
- ✓ Audit logging (49 actions with PHI redaction)
- ✓ CSRF protection (double-submit cookie)
- ✓ Encryption/decryption (AES-256-GCM with key rotation)
- ✓ Rate limiting (Upstash Redis + in-memory fallback)
- ✓ Email (Resend integration for transactional emails)
- ✓ API error handling (consistent JSON responses)
- ✓ Zod validation (on all endpoints)

### Stubbed (API exists, logic incomplete)
- ◐ Google Calendar integration (routes exist, OAuth not complete)
- ◐ NFSe invoicing (routes exist, NF-e generation not complete)
- ◐ Appointment reminders (cron endpoint exists, email not sent)
- ◐ Payment reminders (cron endpoint exists, email not sent)

### Missing (No implementation)
- ✗ i18n framework (hardcoded Portuguese)
- ✗ Feature flags (no way to toggle features)
- ✗ Structured logging (console.log scattered, no centralized logger)
- ✗ SWR/React Query (manual useEffect fetching in all components)
- ✗ LGPD data deletion automation (consent tracking exists, deletion not automated)
- ✗ SMS notifications (only email)
- ✗ Video recording (sessions support attachments, not live recording)
- ✗ Patient satisfaction surveys
- ✗ Therapist availability templates (custom hours per therapist)

---

## Known Gaps (Prioritized by Impact)

### Critical (Security/Compliance)
1. **CPF field stored plaintext** — Should be encrypted; impacts LGPD compliance
2. **Clinical session noteText not encrypted** — Should use AES-256-GCM like journal entries
3. **No structured logging** — Scattered console.log makes debugging hard in production

### High (Feature Completeness)
4. **Appointment reminders not working** — Cron route exists but emails not sent
5. **Google Calendar integration stubbed** — OAuth flow incomplete
6. **No SWR/React Query** — Components use manual useEffect + useState (inefficient, brittle)

### Medium (User Experience)
7. **No i18n framework** — Portuguese is hardcoded; expansion to other languages difficult
8. **No feature flags** — Can't toggle features on/off without code deployment
9. **LGPD data deletion not automated** — Manual process required

### Low (Polish/Future)
10. **NFSe integration incomplete** — Tax invoicing stubbed
11. **No therapist availability templates** — Can't set availability per therapist
12. **No patient satisfaction surveys** — No feedback collection

---

## What Must Be Preserved (Immutable Invariants)

### Data Isolation Invariants
- [ ] EVERY database query MUST include tenantId in WHERE clause
- [ ] Patient portal queries MUST scope by patientAuthId
- [ ] PSYCHOLOGIST role MUST only see assigned patients (assignedUserId filter)
- [ ] ASSISTANT role MUST NEVER access clinical sessions or files
- [ ] READONLY role MUST NOT modify any data

### Auth Invariants
- [ ] Staff auth (NextAuth) and patient auth (PatientAuth) are completely separate systems (no cross-contamination)
- [ ] Patient portal sessions use SHA-256 hashed tokens (NOT JWT) stored in database
- [ ] Portal sessions expire after 30 minutes of inactivity
- [ ] CSRF validation runs on every state-changing request (POST, PUT, DELETE, PATCH)
- [ ] Password hashing uses PBKDF2 with SHA-256 and 600k iterations (do NOT reduce for performance)

### Business Logic Invariants
- [ ] Partial payment remainder charge creation MUST be atomic (single Prisma transaction)
- [ ] Charge with existing Payment MUST NOT be deletable
- [ ] Recurring appointment conflict detection MUST run inside transaction (no race conditions)
- [ ] Journal entry noteText MUST be encrypted before storage (AES-256-GCM)
- [ ] Crisis keyword detection MUST run on journal create AND update
- [ ] Soft-deleted records (sessions, files) MUST be retained for 30 days before hard delete
- [ ] Soft-deleted records MUST NOT be visible in normal queries (include { deletedAt: null })

### Encryption Invariants
- [ ] ENCRYPTION_KEY format: 32 bytes, base64-encoded
- [ ] ENCRYPTION_KEY_PREVIOUS must exist for key rotation
- [ ] Encrypted payloads include version byte for backward compatibility
- [ ] Decryption must support all previous versions (never break old keys)
- [ ] File uploads MUST validate magic bytes (not just Content-Type header)

### Audit Invariants
- [ ] EVERY state-changing operation MUST create AuditLog entry
- [ ] PHI fields MUST be redacted in audit summaries (21 sensitive keys)
- [ ] Audit logs MUST include action, user, tenant, timestamp, entity ID, change details
- [ ] Audit logs MUST be immutable (no deletion, only soft-delete with retention)

### Schema Invariants
- [ ] Tenant is the root entity — all data belongs to exactly one tenant
- [ ] User ↔ Tenant via Membership (many-to-many with role)
- [ ] Patient belongs to Tenant, optionally assigned to User (psychologist)
- [ ] Appointment links Patient + User + AppointmentType
- [ ] Charge can link to Appointment OR ClinicalSession (or neither)
- [ ] Payment belongs to Charge (many payments per charge for partials)
- [ ] Foreign key constraints are NOT enforced at DB level (rely on application)

### Code Pattern Invariants
- [ ] All API handlers follow: getAuthContext() → requirePermission() → Zod.parse() → business logic → audit log → response
- [ ] All errors go through handleApiError() for consistent JSON error format
- [ ] Email sends are fire-and-forget (non-fatal, errors logged but don't fail request)
- [ ] File operations are non-fatal (don't fail the request if file upload fails)
- [ ] All date operations use date-fns-tz for timezone-aware math
- [ ] Pagination always includes { take, skip } validation

### Performance Invariants
- [ ] Rate limiting applies to auth endpoints (prevent brute force)
- [ ] Session creation is not rate-limited (prevent lockout)
- [ ] File uploads use streaming (not buffered in memory)
- [ ] Queries use pagination (no unbounded SELECT * queries)

---

## Summary

Psycologger is a complex, multi-tenant clinical application with two distinct user bases (staff and patients), stringent security requirements, and Brazilian-specific compliance needs. The architecture is clean and follows consistent patterns (pattern-based development). The biggest risks are data isolation (tenantId everywhere), encryption backward compatibility, and payment atomicity. The biggest gaps are CPF encryption, session noteText encryption, and appointment reminders. Every code change should preserve the invariants listed above.
