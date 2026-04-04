# Database Schema

Complete documentation of the Psycologger PostgreSQL database, including all models, enums, relationships, indexes, and data management patterns.

---

## Overview

**ORM:** Prisma 5.22
**Database:** PostgreSQL (via Supabase)
**Connection Pool:** pgBouncer (transaction mode for runtime, direct for migrations)
**Total Models:** 30+
**Total Enums:** 14+
**Relations:** 50+ foreign keys with cascade/restrict strategies

---

## Connection Configuration

### Runtime Connection (pgBouncer Transaction Pooler)

**Connection String:**
```
postgresql://user:password@transaction-pool-host:6432/psycologger
```

**Why Transaction Pooler:**
- Vercel serverless functions scale horizontally
- Each function opens connection (would exhaust direct pool)
- pgBouncer multiplexes connections
- Maximum 20 concurrent connections per pool

**Configuration (prisma/schema.prisma):**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### Migration Connection (Direct)

**Connection String:**
```
postgresql://user:password@direct-host:5432/psycologger
```

**Why Direct Connection:**
- Migrations require session management
- Cannot use transaction pooler (pgBouncer limitation)
- Direct connection to primary database

**Usage:**
```bash
# Uses DATABASE_MIGRATION_URL
npx prisma migrate deploy
npx prisma migrate dev
```

---

## Models by Domain

### Authentication Models

#### User (Staff)
```prisma
model User {
  id                    String      @id @default(cuid())
  email                 String      @unique
  name                  String?
  passwordHash          String?     // Null for magic-link only
  picture               String?
  role                  UserRole    @default(PSYCHOLOGIST)
  isSuperAdmin          Boolean     @default(false)
  tenantId              String?
  tenant                Tenant?     @relation(fields: [tenantId], references: [id])

  // Invitation tracking
  invitationToken       String?     @unique
  invitationTokenExpiresAt DateTime?
  invitedAt             DateTime?

  // Activity tracking
  lastLoginAt           DateTime?
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  deletedAt             DateTime?   // Soft-delete
  deletedBy             String?

  // Relations
  patients              Patient[]
  appointments          Appointment[]
  sessions              JournalEntry[]
  auditLogs             AuditLog[]

  @@index([tenantId])
  @@index([email])
}
```

**Key Features:**
- `isSuperAdmin` flag for platform-level access
- `invitationToken` for 7-day invitation links
- `lastLoginAt` tracked for compliance reporting
- Soft-delete with 30-day retention

#### PatientAuth (Patient Portal Credentials)
```prisma
model PatientAuth {
  id                    String      @id @default(cuid())
  patientId             String      @unique
  patient               Patient     @relation(fields: [patientId], references: [id], onDelete: Cascade)

  email                 String      @unique
  passwordHash          String      // PBKDF2-SHA256, 600k iterations
  passwordSalt          String      // 32-byte random salt

  activatedAt           DateTime?   // When patient first activated account
  lastLoginAt           DateTime?

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  // Relations
  loginAttempts         LoginAttempt[]
  magicTokens           PatientMagicToken[]

  @@index([email])
}
```

**Security Details:**
- Password never stored in plain text
- PBKDF2: 600,000 iterations (OWASP standard)
- SHA-256 hash function
- 32-byte cryptographically random salt per user

#### PatientPortalSession
```prisma
model PatientPortalSession {
  id                    String      @id @default(cuid())
  patientId             String
  patient               Patient     @relation(fields: [patientId], references: [id], onDelete: Cascade)

  tokenHash             String      @unique  // SHA256(token)
  lastActivityAt        DateTime    @updatedAt
  expiresAt             DateTime

  ipAddress             String?     // Optional for audit
  userAgent             String?     // Optional for device tracking

  createdAt             DateTime    @default(now())

  @@index([patientId])
  @@index([tokenHash])
  @@index([expiresAt])
}
```

**Lifetime Management:**
- `expiresAt`: 7-day absolute expiry
- `lastActivityAt`: 30-minute idle timeout
- Auto-cleanup cron job removes expired sessions daily

#### LoginAttempt (Rate Limiting)
```prisma
model LoginAttempt {
  id                    String      @id @default(cuid())
  patientAuthId         String
  patientAuth           PatientAuth @relation(fields: [patientAuthId], references: [id], onDelete: Cascade)

  failedAttempts        Int         @default(0)
  lockoutUntil          DateTime?
  ipAddress             String      // For tracking

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  @@index([patientAuthId, ipAddress])
}
```

**Rate Limiting Logic:**
- Max 5 failed attempts
- 15-minute lockout after threshold
- Reset on successful login

#### PatientMagicToken
```prisma
model PatientMagicToken {
  id                    String      @id @default(cuid())
  patientAuthId         String
  patientAuth           PatientAuth @relation(fields: [patientAuthId], references: [id], onDelete: Cascade)

  token                 String      @unique
  expiresAt             DateTime
  usedAt                DateTime?   // Null until used

  createdAt             DateTime    @default(now())

  @@index([token, expiresAt])
}
```

### Tenant & Organization Models

#### Tenant (Clinic Organization)
```prisma
model Tenant {
  id                    String      @id @default(cuid())
  name                  String
  slug                  String      @unique

  // Contact
  email                 String
  phone                 String?
  address               String?
  city                  String?
  state                 String?
  zipCode               String?
  country               String?

  // Subscription
  planId                String      // Pricing tier
  subscriptionStatus    SubscriptionStatus @default(ACTIVE)

  // Settings
  currency              String      @default("BRL")
  timezone              String      @default("America/Sao_Paulo")
  language              String      @default("pt-BR")
  adminCanViewClinical  Boolean     @default(false)

  // Compliance
  cnpj                  String?     // Brazilian business ID
  legalName             String?

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  deletedAt             DateTime?

  // Relations
  users                 User[]
  patients              Patient[]
  appointments          Appointment[]
  sessions              JournalEntry[]
  charges               Charge[]
  paymentReminders      PaymentReminder[]
  auditLogs             AuditLog[]

  @@index([slug])
}
```

**Key Settings:**
- `adminCanViewClinical`: TENANT_ADMIN can view psychologist notes (conditional permission)
- `currency`: All prices in cents (stored as integers)
- `timezone`: Used for appointment scheduling and report dates

### Patient Models

#### Patient
```prisma
model Patient {
  id                    String      @id @default(cuid())
  tenantId              String
  tenant                Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Identity
  firstName             String
  lastName              String
  email                 String
  phone                 String?
  cpf                   String?     // Brazilian CPF (encrypted at rest)
  birthDate             DateTime?

  // Contact
  address               String?
  city                  String?
  state                 String?
  zipCode               String?

  // Clinical
  psychologistId        String
  psychologist          User        @relation(fields: [psychologistId], references: [id])
  status                PatientStatus @default(ACTIVE)

  // Notes
  notes                 String?

  // Tracking
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  createdBy             String
  updatedBy             String?
  deletedAt             DateTime?
  deletedBy             String?

  // Relations
  portalAuth            PatientAuth?
  portalSessions        PatientPortalSession[]
  appointments          Appointment[]
  sessions              JournalEntry[]
  charges               Charge[]
  journals              Journal[]

  @@index([tenantId, psychologistId])
  @@unique([tenantId, email])  // Email unique per tenant
}
```

**Data Sensitivity:**
- CPF encrypted in database (sensitive Brazilian ID)
- Email unique per tenant (prevent duplicate registrations)
- Created/updated tracking for audit

#### Journal (Patient Portal Journals)
```prisma
model Journal {
  id                    String      @id @default(cuid())
  patientId             String
  patient               Patient     @relation(fields: [patientId], references: [id], onDelete: Cascade)

  title                 String?
  content               String      // Encrypted at rest
  mood                  Int?        // 1-5 scale
  tags                  String[]    @default([])

  status                JournalStatus @default(DRAFT)
  reviewedAt            DateTime?
  reviewedBy            String?     // Psychologist ID
  professionalNotes     String?     // Psychologist response (encrypted)

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  @@index([patientId, createdAt])
}
```

**Content Encryption:**
- `content` encrypted with tenant-scoped key
- Only patient + assigned psychologist can decrypt
- Decryption happens in application layer (Prisma middleware)

### Appointment & Session Models

#### Appointment
```prisma
model Appointment {
  id                    String      @id @default(cuid())
  tenantId              String
  tenant                Tenant      @relation(fields: [tenantId], references: [id])

  patientId             String
  patient               Patient     @relation(fields: [patientId], references: [id], onDelete: Cascade)

  appointmentTypeId     String
  appointmentType       AppointmentType @relation(fields: [appointmentTypeId], references: [id])

  psychologistId        String
  psychologist          User        @relation(fields: [psychologistId], references: [id])

  // Scheduling
  scheduledAt           DateTime
  durationMinutes       Int
  status                AppointmentStatus @default(SCHEDULED)

  notes                 String?
  reminderEnabled       Boolean     @default(true)
  reminderSentAt        DateTime?

  // Links to records
  sessionId             String?
  session               JournalEntry?

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  deletedAt             DateTime?

  @@index([tenantId, scheduledAt])
  @@index([patientId, scheduledAt])
  @@index([psychologistId, scheduledAt])
  @@index([status])
}
```

**Composite Indexes:**
- tenant + date for monthly schedules
- patient + date for patient calendar
- psychologist + date for therapist workload

#### AppointmentType
```prisma
model AppointmentType {
  id                    String      @id @default(cuid())
  tenantId              String

  name                  String
  durationMinutes       Int
  priceInCents          Int        // All prices in cents
  color                 String?     // Hex color for calendar

  active                Boolean     @default(true)

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  // Relations
  appointments          Appointment[]
  charges               Charge[]

  @@unique([tenantId, name])
}
```

**Pricing Model:**
- All prices stored as integers (cents)
- Currency determined by Tenant.currency
- BRL example: 15000 = R$ 150,00

#### JournalEntry (Session Notes)
```prisma
model JournalEntry {
  id                    String      @id @default(cuid())
  tenantId              String
  tenant                Tenant      @relation(fields: [tenantId], references: [id])

  patientId             String
  patient               Patient     @relation(fields: [patientId], references: [id], onDelete: Cascade)

  psychologistId        String
  psychologist          User        @relation(fields: [psychologistId], references: [id])

  appointmentId         String?
  appointment           Appointment?

  // Clinical content
  sessionDate           DateTime
  noteText              String      // Encrypted at rest
  status                SessionStatus @default(DRAFT)

  // Homework & follow-up
  homework              String?
  nextSessionPlanned    DateTime?
  tags                  String[]    @default([])

  // Tracking
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  deletedAt             DateTime?

  // Relations
  files                 SessionFile[]

  @@index([tenantId, psychologistId])
  @@index([patientId, sessionDate])
  @@index([status])
}
```

**Content Encryption:**
- `noteText` encrypted with tenant-scoped key
- Only creator psychologist + conditional admin access
- Decryption requires `Tenant.adminCanViewClinical` for non-creator access

#### SessionFile
```prisma
model SessionFile {
  id                    String      @id @default(cuid())
  sessionId             String
  session               JournalEntry @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  fileName              String
  fileSize              Int         // In bytes
  fileType              String      // MIME type
  storageUrl            String      // S3/Cloud Storage path

  description           String?

  createdAt             DateTime    @default(now())

  @@index([sessionId])
}
```

**File Storage:**
- Uploaded to Vercel Blob Storage or AWS S3
- Large files (> 10MB) stored separately
- URLs are signed/temporary (24-hour expiry)

#### JournalNote (NEW)
```prisma
model JournalNote {
  id                    String      @id @default(cuid())
  tenantId              String
  tenant                Tenant      @relation(fields: [tenantId], references: [id])

  journalEntryId        String
  journalEntry          JournalEntry @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)

  authorId              String
  author                User        @relation(fields: [authorId], references: [id])

  noteText              String      // Encrypted at rest (AES-256-GCM)

  deletedAt             DateTime?   // Soft-delete

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  @@index([journalEntryId])
  @@index([tenantId, authorId])
}
```

**Private Therapist Annotations:**
- Encrypted at rest with AES-256-GCM (same key as journal entry notes)
- Only therapist author can view/delete
- Soft-deleted via `deletedAt` field
- NEVER visible to patients through portal API
- Decryption happens in application layer

### Financial Models

#### Charge (Invoice)
```prisma
model Charge {
  id                    String      @id @default(cuid())
  tenantId              String
  tenant                Tenant      @relation(fields: [tenantId], references: [id])

  patientId             String
  patient               Patient     @relation(fields: [patientId], references: [id], onDelete: Cascade)

  appointmentTypeId     String?
  appointmentType       AppointmentType? @relation(fields: [appointmentTypeId], references: [id])

  // Amount
  amountInCents         Int         // Price in cents
  currency              String      @default("BRL")
  description           String

  // Dates
  issuedAt              DateTime    @default(now())
  dueDate               DateTime
  paidAt                DateTime?

  // Status
  status                ChargeStatus @default(PENDING)

  // Tracking
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  deletedAt             DateTime?

  // Relations
  payments              Payment[]

  @@index([tenantId, dueDate])
  @@index([patientId, status])
  @@index([status])
}
```

**Payment Tracking:**
- Multiple payments per charge (partial payments)
- Status auto-updates: PENDING → PAID when paidAt set
- Overdue logic: status = OVERDUE if dueDate < today AND status = PENDING

#### Payment
```prisma
model Payment {
  id                    String      @id @default(cuid())
  chargeId              String
  charge                Charge      @relation(fields: [chargeId], references: [id], onDelete: Cascade)

  amountInCents         Int
  paymentMethod         PaymentMethod
  reference             String?     // PIX ref, check number, etc.

  recordedBy            String      // User ID

  createdAt             DateTime    @default(now())

  @@index([chargeId])
}
```

**Payment Methods:**
- CASH
- TRANSFER (bank transfer)
- CREDIT_CARD
- PIX (Brazilian instant payment)

#### PaymentReminder
```prisma
model PaymentReminder {
  id                    String      @id @default(cuid())
  tenantId              String
  tenant                Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  templateId            String
  daysBeforeDue         Int         // Send reminder X days before due date

  subject               String
  body                  String      // Email template with {{variables}}

  active                Boolean     @default(true)
  lastSentAt            DateTime?

  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt

  @@index([tenantId, daysBeforeDue])
}
```

**Email Template Variables:**
- `{{patientName}}` - Patient first name
- `{{amount}}` - Charge amount formatted
- `{{dueDate}}` - Due date in locale format
- `{{clinicName}}` - Tenant name
- `{{paymentLink}}` - Portal payment page URL

#### PaymentReminderLog
```prisma
model PaymentReminderLog {
  id                    String      @id @default(cuid())
  reminderId            String
  chargeId              String

  sentAt                DateTime    @default(now())
  sentTo                String      // Patient email
  status                String      // 'sent' | 'failed'
  error                 String?     // Error message if failed

  @@index([chargeId, sentAt])
}
```

### Audit & Reporting Models

#### AuditLog
```prisma
model AuditLog {
  id                    String      @id @default(cuid())
  tenantId              String
  tenant                Tenant      @relation(fields: [tenantId], references: [id])

  userId                String
  user                  User        @relation(fields: [userId], references: [id])

  // What changed
  entityType            String      // 'Patient', 'Charge', 'Session', etc.
  entityId              String
  action                AuditAction

  // Details
  changes               Json?       // { before, after } for updates
  ipAddress             String?
  userAgent             String?

  createdAt             DateTime    @default(now())

  @@index([tenantId, createdAt])
  @@index([entityType, entityId])
  @@index([userId, createdAt])
}
```

**Audit Actions:**
- CREATE
- READ
- UPDATE
- DELETE
- EXPORT
- DOWNLOAD

**Change Tracking:**
```json
{
  "before": { "firstName": "João", "status": "ACTIVE" },
  "after": { "firstName": "João", "status": "INACTIVE" }
}
```

---

## Enums

### UserRole
```prisma
enum UserRole {
  SUPERADMIN
  TENANT_ADMIN
  PSYCHOLOGIST
  ASSISTANT
  READONLY
}
```

### SubscriptionStatus
```prisma
enum SubscriptionStatus {
  ACTIVE
  CANCELLED
  SUSPENDED
  EXPIRED
}
```

### PatientStatus
```prisma
enum PatientStatus {
  ACTIVE
  INACTIVE
  DISCHARGED
  SUSPENDED
}
```

### AppointmentStatus
```prisma
enum AppointmentStatus {
  SCHEDULED
  COMPLETED
  CANCELLED
  NO_SHOW
  RESCHEDULED
}
```

### SessionStatus
```prisma
enum SessionStatus {
  DRAFT
  COMPLETED
  ARCHIVED
}
```

### ChargeStatus
```prisma
enum ChargeStatus {
  PENDING
  PAID
  OVERDUE
  CANCELLED
  PARTIALLY_PAID
}
```

### PaymentMethod
```prisma
enum PaymentMethod {
  CASH
  TRANSFER
  CREDIT_CARD
  PIX
}
```

### JournalStatus
```prisma
enum JournalStatus {
  DRAFT
  SUBMITTED
  REVIEWED
}
```

### AuditAction
```prisma
enum AuditAction {
  CREATE
  READ
  UPDATE
  DELETE
  EXPORT
  DOWNLOAD
  LOGIN
}
```

---

## Indexes & Query Performance

### Composite Indexes for Common Queries

**Appointment Calendar (by psychologist + date):**
```sql
CREATE INDEX idx_appointment_psychologist_date
ON "Appointment"("psychologistId", "scheduledAt" DESC);
```

**Patient Sessions (by patient + date):**
```sql
CREATE INDEX idx_journal_entry_patient_date
ON "JournalEntry"("patientId", "sessionDate" DESC);
```

**Charges Due (by status + date):**
```sql
CREATE INDEX idx_charge_status_duedate
ON "Charge"("status", "dueDate");
```

**Tenant Data Isolation:**
```sql
CREATE INDEX idx_tenant_id ON all_tables("tenantId");
```

### Query Plans

**List patient appointments for month:**
```sql
SELECT * FROM "Appointment"
WHERE "patientId" = ?
  AND "scheduledAt" >= ?
  AND "scheduledAt" < ?
ORDER BY "scheduledAt" DESC;
```
Uses: `idx_appointment_patient_date`

**Overdue invoices by tenant:**
```sql
SELECT * FROM "Charge"
WHERE "tenantId" = ?
  AND "status" = 'PENDING'
  AND "dueDate" < NOW();
```
Uses: `idx_charge_status_duedate`

---

## Soft-Delete Pattern

### Implementation

**Fields on all entities:**
- `deletedAt: DateTime?` - NULL = active, non-NULL = deletion timestamp
- `deletedBy: String?` - User ID who performed deletion

**Retention Policy:** 30 days
- Automatic cleanup of records older than 30 days
- Cron job: `/api/v1/cron/cleanup-deleted` runs daily
- Soft-deleted records still queryable (for recovery)

**Query Pattern:**
```typescript
// Active records only (default)
const active = await db.patient.findMany({
  where: {
    tenantId,
    deletedAt: null,
  },
});

// Include soft-deleted (admin recovery)
const allRecords = await db.patient.findMany({
  where: { tenantId },
});
```

---

## Data Encryption

### Field-Level Encryption (Prisma Middleware)

**Encrypted Fields:**
- `PatientAuth.passwordHash` - PBKDF2 (hashed, not encrypted)
- `JournalEntry.noteText` - AES-256-GCM encrypted
- `Journal.content` - AES-256-GCM encrypted
- `Journal.professionalNotes` - AES-256-GCM encrypted
- `Patient.cpf` - AES-256-GCM encrypted

**Key Management:**
- Master encryption key in environment variable
- One key per tenant (derived from master key + tenant ID)
- Key rotation via migration (decrypt with old key, encrypt with new)

**Middleware Integration:**
```typescript
const prisma = new PrismaClient().$extends({
  query: {
    journalEntry: {
      async findUnique({ args, query }) {
        const result = await query(args);
        if (result) {
          result.noteText = decrypt(result.noteText, tenantKey);
        }
        return result;
      },
      async create({ args, query }) {
        args.data.noteText = encrypt(args.data.noteText, tenantKey);
        return query(args);
      },
    },
  },
});
```

---

## Cascade & Referential Integrity

### Cascade Delete Strategy

**Hard Deletes (with cascade):**
```prisma
// Deleting session deletes session files automatically
sessionFiles SessionFile[]  @relation(onDelete: Cascade)

// Deleting patient deletes all their records
appointments Appointment[] @relation(onDelete: Cascade)
sessions     JournalEntry[] @relation(onDelete: Cascade)
charges      Charge[]       @relation(onDelete: Cascade)
```

**Soft Deletes (no cascade):**
```prisma
// Deleting patient does NOT delete related charges
// (marked with deletedAt instead)
charges      Charge[]
```

**Restrict (prevent deletion):**
```prisma
// Cannot delete tenant if users exist
users        User[]  @relation(onDelete: Restrict)
```

---

## Migrations

### Migration History

**Migration 1: `create_core_schema`**
- Initial tables: User, Tenant, Patient, Appointment, JournalEntry, Charge
- Date: 2024-01-01

**Migration 2: `add_patient_portal`**
- Add: PatientAuth, PatientPortalSession, LoginAttempt, PatientMagicToken
- Date: 2024-06-15

**Migration 3: `add_portal_idle_timeout`**
- Add: `lastActivityAt` field to PatientPortalSession
- Add: Cron job for idle session cleanup
- Date: 2024-09-01

**Migration 4: `add_payment_reminders`**
- Add: PaymentReminder, PaymentReminderLog tables
- Date: 2024-10-15

### Running Migrations

**Development:**
```bash
# Uses DATABASE_MIGRATION_URL (direct connection)
npx prisma migrate dev --name <migration_name>

# Generates new migration from schema changes
npx prisma migrate diff --from-schema-datasource --to-schema-file ./prisma/schema.prisma --script
```

**Production Deployment:**
```bash
# Vercel automatically runs on deployment
npx prisma migrate deploy

# Or manual (if needed)
PRISMA_SKIP_ENGINE_CHECK=1 npx prisma migrate deploy --skip-generate
```

---

## Seed Data

### Development Seed Script (`prisma/seed.ts`)

**Populated Records:**

1. **SuperAdmin User**
   - Email: admin@psycologger.dev
   - Password: (magic-link only)
   - Role: SUPERADMIN

2. **Demo Tenant (Clinic)**
   - Name: "Clínica Demo"
   - CNPJ: 12345678901234
   - Currency: BRL
   - Timezone: America/Sao_Paulo

3. **Demo Users**
   - TENANT_ADMIN: admin@clinic.dev
   - PSYCHOLOGIST: psico@clinic.dev (with 3 patients)
   - ASSISTANT: assist@clinic.dev
   - READONLY: viewer@clinic.dev

4. **Demo Patients (for PSYCHOLOGIST)**
   - 3 active patients with:
     - 5 appointments each (mix of scheduled/completed)
     - 3 sessions each with notes
     - 2 charges each (pending + paid)
     - 1 journal entry each

5. **Demo Charges**
   - Various states: pending (overdue + current), paid, cancelled
   - Payment methods: cash, transfer, PIX

**Running Seed:**
```bash
npx prisma db seed
```

---

## ER Diagram

```
Tenant
├── User (staff)
│   ├── Appointments
│   └── JournalEntries (sessions)
├── Patient
│   ├── PatientAuth (portal credentials)
│   │   ├── LoginAttempt (rate limiting)
│   │   └── PatientMagicToken (magic-links)
│   ├── PatientPortalSession (active sessions)
│   ├── Appointment
│   │   ├── AppointmentType
│   │   └── JournalEntry (linked session)
│   ├── JournalEntry (sessions)
│   │   └── SessionFile (attachments)
│   ├── Journal (patient portal journals)
│   ├── Charge (invoices)
│   │   ├── AppointmentType
│   │   └── Payment (recorded payments)
│   └── [deleted via soft-delete]
├── AppointmentType
├── PaymentReminder
│   └── PaymentReminderLog (cron history)
└── AuditLog (all changes)
```

### Relationship Summary

| Entity | Relations | Type | Delete Policy |
|--------|-----------|------|---------------|
| Tenant | users, patients, appointments, charges | 1:N | Cascade |
| User (staff) | appointments, sessions | 1:N | Cascade |
| Patient | portal sessions, appointments, charges, sessions | 1:N | Cascade |
| Appointment | patient, type, psychologist, session | N:1 | Foreign Key |
| JournalEntry | patient, psychologist, files | 1:N | Cascade files |
| Charge | patient, payments, type | 1:N | Cascade payments |
| AuditLog | tenant, user, entity | N:1 | Restrict |

---

## Data Types & Constraints

### Common Constraints

**Non-nullable fields:**
- User.email, User.name
- Patient.firstName, Patient.lastName, Patient.email
- Tenant.name, Tenant.slug
- Appointment.scheduledAt, Appointment.status
- Charge.amountInCents, Charge.dueDate
- JournalEntry.noteText, JournalEntry.sessionDate

**Unique constraints:**
- User.email (globally)
- Tenant.slug, Tenant.cnpj
- Patient.email (per tenant)
- PatientAuth.email (globally)
- AppointmentType.name (per tenant)

**Check constraints (business logic):**
```sql
-- Charge amount > 0
ALTER TABLE "Charge"
ADD CONSTRAINT chk_charge_amount_positive CHECK ("amountInCents" > 0);

-- Appointment duration > 0
ALTER TABLE "Appointment"
ADD CONSTRAINT chk_appointment_duration CHECK ("durationMinutes" > 0);

-- Due date >= issued date
ALTER TABLE "Charge"
ADD CONSTRAINT chk_charge_due_date CHECK ("dueDate" >= "issuedAt");
```

---

## Performance Tuning

### Connection Pool Settings

**pgBouncer (Runtime):**
```
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 10
pool_mode = transaction
```

**Benefits:**
- Handles 50+ concurrent serverless functions
- Automatic multiplexing
- Reduced connection overhead

### Query Optimization

**N+1 Query Prevention (Prisma):**
```typescript
// BAD - N+1 queries
const appointments = await db.appointment.findMany();
for (const apt of appointments) {
  const patient = await db.patient.findUnique({
    where: { id: apt.patientId }
  });
}

// GOOD - Single query with relation
const appointments = await db.appointment.findMany({
  include: { patient: true }
});
```

**Selective Includes:**
```typescript
// Only load needed relations
const session = await db.journalEntry.findUnique({
  where: { id },
  include: {
    patient: { select: { id: true, firstName: true } },
    files: true,
    // Don't include psychologist (large object)
  },
});
```

### Large Result Pagination

**For lists over 1000 records:**
```typescript
const page = 1;
const limit = 50;

const [items, total] = await Promise.all([
  db.patient.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  }),
  db.patient.count({ where: { tenantId } }),
]);

return { items, total, page, limit };
```

---

## Backup & Recovery

### Automatic Backups (Supabase)

- **Frequency:** Daily
- **Retention:** 30 days
- **Type:** Full database snapshots
- **Recovery:** Point-in-time restore available

### Manual Backups

```bash
# Export full database
pg_dump postgresql://user:pass@host:5432/psycologger > backup.sql

# Restore
psql postgresql://user:pass@host:5432/psycologger < backup.sql

# Export specific table (audit logs)
pg_dump -t audit_log postgresql://... > audit_backup.sql
```

---

## Compliance & Privacy

### LGPD Compliance (Brazilian Privacy Law)

**Right to be Forgotten:**
```typescript
// Soft-delete patient (retained 30 days)
await db.patient.update({
  where: { id },
  data: { deletedAt: new Date() },
});

// Hard-delete after 30 days
await db.patient.deleteMany({
  where: { deletedAt: { lte: thirtyDaysAgo } },
});
```

**Data Export:**
```typescript
// Export patient data (GDPR/LGPD right)
const patient = await db.patient.findUnique({
  where: { id },
  include: {
    appointments: true,
    sessions: { include: { files: true } },
    charges: { include: { payments: true } },
    journals: true,
  },
});

// Return as JSON for download
return JSON.stringify(patient, null, 2);
```

**Audit Trail:**
- All changes logged to AuditLog
- User + timestamp tracked
- 90-day retention minimum

---

## Summary

| Aspect | Details |
|--------|---------|
| **ORM** | Prisma 5.22 |
| **Database** | PostgreSQL on Supabase |
| **Models** | 30+ entities |
| **Enums** | 14+ types |
| **Indexes** | 50+ (composite + single) |
| **Encryption** | AES-256-GCM for PII |
| **Soft-Delete** | 30-day retention |
| **RBAC** | 5 roles, 27 permissions |
| **Compliance** | LGPD-ready, GDPR-compatible |
| **Backups** | Daily, 30-day retention |
