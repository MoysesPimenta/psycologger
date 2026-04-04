# Business Domains

Psycologger's clinical practice management is organized into 8 core business domains. Each domain encapsulates specific clinical, operational, and compliance requirements for Brazilian psychologists.

## 1. Patients

The Patient domain manages the core demographic and clinical data for individuals receiving care.

### Key Features

- **CRUD Operations**: Create, read, update, delete patient records with soft-delete support for archiving
- **Search & Filtering**: Full-text search by name, email, phone; filter by status (active/archived), tags, assigned provider
- **Tags**: Custom organizational tags assigned per patient for grouping and filtering
- **Provider Assignment**: Link patients to primary psychologist/assistant for appointment routing
- **Consent Tracking**: Capture patient consents (TERMS_OF_USE, PRIVACY_POLICY, DATA_SHARING, JOURNAL_SHARING) with timestamps
- **Portal Invite**: Generate and send secure invitations for patients to access the Patient Portal
- **Archiving**: Soft-delete preserves historical data; unarchive available for active records

### Data Model

```
fields: id, tenantId, name, email, phone, cpf, birthDate, address, city, state,
        zipCode, notes, tags[], assignedPsychologistId, status (ACTIVE/ARCHIVED),
        createdAt, updatedAt, deletedAt
```

### Privacy & Security

**CPF Storage**: Currently stored in plaintext in the database. **CRITICAL**: Should be encrypted using AES-256-GCM with tenant-specific keys to comply with Brazilian data protection standards (LGPD).

**Consent Management**: Consents are captured at the time of patient portal invitation and tracked with timestamps. Portal access requires acceptance of TERMS_OF_USE. Consent audit trail available via audit logs.

### Access Control

- SUPERADMIN: Full CRUD across all tenants
- TENANT_ADMIN: CRUD within tenant; can assign providers
- PSYCHOLOGIST: View own patients; manage own assignments
- ASSISTANT: View assigned patients (read-only or with PSYCHOLOGIST_ASSISTANT role)
- READONLY: View-only access

## 2. Appointments

The Appointment domain manages the scheduling and lifecycle of clinical sessions with timezone awareness and conflict detection.

### Key Features

- **Single & Recurring**: Create one-off or recurring appointments using IANA timezone identifiers (e.g., "America/Sao_Paulo")
- **Timezone-Aware Scheduling**: date-fns-tz integration ensures correct time calculations across timezones
- **Conflict Detection**: Automatic detection within provider's schedule; conflicts checked inside transactions to prevent double-booking
- **Status Lifecycle**:
  - SCHEDULED: Initial state
  - CONFIRMED: Acknowledged by provider or patient
  - COMPLETED: Session finished and clinical notes recorded
  - CANCELED: Manually canceled; future recurring appointments cascade-canceled
  - NO_SHOW: Patient did not attend
- **Recurring Cascade**: Canceling a recurring appointment applies to all future instances (atomic transaction)
- **Email Notifications**:
  - Confirmation email sent to patient and psychologist on creation
  - Reminder emails sent 24 hours before (daily cron)
  - Cancellation emails sent to both parties
- **Google Calendar Sync**: Stub implementation present; full integration available via Google Calendar API

### Data Model

```
fields: id, tenantId, patientId, psychologistId, appointmentTypeId, startTime, endTime,
        status (SCHEDULED/CONFIRMED/COMPLETED/CANCELED/NO_SHOW), notes, timezone,
        isRecurring, recurringPattern (DAILY/WEEKLY/BIWEEKLY/MONTHLY), recurringEndDate,
        recurringGroupId, cancelled, createdAt, updatedAt
```

### Business Rules

- **Conflict Prevention**: Before creating, query overlapping appointments for the same provider in the same timezone
- **Cascade Cancellation**: When a recurring appointment is canceled, `WHERE recurringGroupId = ? AND startTime > NOW()` are also canceled
- **Timezone Handling**: `startTime` and `endTime` stored as TIMESTAMP WITH TIMEZONE; display respects patient/provider timezone preference
- **Duration**: Calculated from `endTime - startTime`; typically 50 min (standard session) or 100 min (double session)

### Access Control

- SUPERADMIN: Full CRUD across all tenants
- TENANT_ADMIN: CRUD within tenant
- PSYCHOLOGIST: Create for own patients; view/update own appointments
- ASSISTANT: Create under supervision; view assigned appointments
- READONLY: View-only access

## 3. Clinical Sessions & Notes

Clinical Sessions capture the clinical interaction and clinical notes (also called "session notes") record the content and observations from each session.

### Key Features

- **Creation Options**:
  - Create from existing appointment (links appointment to session)
  - Create standalone session for unscheduled contacts (e.g., crisis support, makeup sessions)
- **Templates**: Three note-taking templates:
  - **FREE**: Unstructured narrative note
  - **SOAP**: Subjective / Objective / Assessment / Plan structure
  - **BIRP**: Behavior / Internal state / Response / Plan (behavioral health focus)
- **Revision Tracking**: Each note edit creates a new revision; full history available for audit compliance
- **Soft-Delete**: Deleted notes retained for 30 days before permanent removal; recovery available during grace period
- **File Attachments**: Documents, images, audio records attached; stored in Supabase Storage (S3/R2 backend)
- **Tag-Based Organization**: Custom tags for quick filtering by topic, outcome, or modality

### Data Model

```
fields: id, tenantId, appointmentId (optional), psychologistId, patientId, template (FREE/SOAP/BIRP),
        noteText (PHI - encrypted), tags[], attachments[], status (DRAFT/COMPLETED),
        createdAt, updatedAt, deletedAt, revisions[]

revisions[]: { id, content, createdAt, createdByUserId }
```

### Privacy & Security

**Clinical PHI**: The `noteText` field contains clinical observations, patient narratives, and sensitive mental health information. This is classified as Protected Health Information (PHI) and should be encrypted at rest using AES-256-GCM.

**Audit Compliance**: All revisions are immutable; deletions soft-delete with 30-day recovery window. Audit logs track who accessed/modified each session.

**File Attachments**: Files are scanned with magic-byte MIME validation; stored with clinical flag to restrict access to treatment team members.

### Access Control

- SUPERADMIN: View all; audit trail
- TENANT_ADMIN: Manage audit logs
- PSYCHOLOGIST: Full CRUD for own sessions; can view patient's sessions from other providers (with audit logging)
- ASSISTANT: Create under supervision; view assigned psychologist's sessions
- READONLY: View-only access

## 4. Charges & Payments

The Charges & Payments domain manages billing, payment collection, and financial reconciliation in Brazilian Real (BRL).

### Key Features

- **Charge Creation**:
  - Link to appointment or clinical session (tracks service provided)
  - Create standalone charges for administrative fees, materials, consultation services
  - One charge per appointment/session (no double-charging)
- **Flexible Payment**:
  - Accept partial payments; remainder automatically created as new charge ("Saldo Restante" pattern)
  - Example: R$ 150 charge, patient pays R$ 100 → create R$ 50 "Saldo Restante" charge
  - Atomic transaction ensures consistency
- **Payment Methods**: PIX, CASH, CARD, TRANSFER, INSURANCE, OTHER
- **Status Lifecycle**:
  - PENDING: Initial state, awaiting payment
  - OVERDUE: Payment not received by due date (detected via daily cron)
  - PAID: Fully settled
- **Overdue Detection**: Daily cron job (9 AM, tenant timezone) updates status and triggers reminder email
- **Currency**: All amounts in BRL; no currency conversion needed (Brazilian-only operation)

### Data Model

```
fields: id, tenantId, appointmentId (optional), sessionId (optional), patientId,
        psychologistId, amount (centavos - integer), description, status (PENDING/OVERDUE/PAID),
        paymentMethod (PIX/CASH/CARD/TRANSFER/INSURANCE/OTHER), dueDate, paidDate,
        createdAt, updatedAt

payments[]: { id, chargeId, amount, method, paidAt, receiptUrl }
```

### Business Rules

- **Partial Payment Logic**:
  ```
  totalCharge = 150.00 BRL
  payment = 100.00 BRL
  remainder = totalCharge - payment = 50.00 BRL
  → Create new charge for 50.00 with description "Saldo Restante"
  ```
- **Atomic Updates**: Both original charge and remainder charge created in single `Prisma.$transaction`
- **Overdue Detection**: `WHERE status = PENDING AND dueDate < NOW()` updated to OVERDUE daily
- **Audit Trail**: Payment recorded with method, amount, date; receipt URL for proof of payment

### Access Control

- SUPERADMIN: Full CRUD across all tenants
- TENANT_ADMIN: CRUD within tenant; view financial reports
- PSYCHOLOGIST: View own patient's charges; record cash payments
- ASSISTANT: Record payments under supervision
- READONLY: View-only access

## 5. Patient Portal

The Patient Portal is a separate, patient-facing web application accessible via unique portal links. It provides patients with self-service clinical and financial access.

### Key Features

#### Dashboard
- **Next Appointment**: Display upcoming appointment with date, time, psychologist name, and join link (if video-enabled)
- **Pending Charges**: Show unpaid balances with due dates; link to payment methods
- **Recent Journal Entries**: Last 3-5 journal entries from past 7 days
- **Notifications**: Unread notification count; link to notification center

#### Session History
- View completed clinical sessions (only if psychologist marked as shared)
- Filter by date range, psychologist, or tags
- Read-only access; no modification

#### Journal (Self-Reporting Tool)
- **Entry Structure**:
  - Date and time (auto-populated)
  - Mood, anxiety, and energy levels (1-10 scales)
  - Sleep quality (1-10 scale)
  - Emotion tags (happy, sad, anxious, angry, calm, proud, ashamed, etc.)
  - Free-text note (encrypted noteText)
  - Visibility: PRIVATE (only patient), SHARED (shared with psychologist), DRAFT (in progress)
- **Crisis Detection**: Background scanning for Portuguese crisis keywords (suicídio, morte, desesperado, automutilação, etc.); flag for immediate alert to psychologist
- **Encryption**: Journal noteText encrypted end-to-end; searchable via encrypted index (if applicable)

#### Payment Management
- View all charges (pending, paid, overdue)
- Payment history with receipts
- Generate invoices (PDF export)
- Payment method integration (PIX via QR code, bank transfer details)

#### Consent Management
- View current consent status for TERMS_OF_USE, PRIVACY_POLICY, DATA_SHARING, JOURNAL_SHARING
- Update consents; old version retained in audit trail
- Consent withdrawal supported (audit-logged)

#### Notification Center
- In-app notifications for appointment confirmations, payment reminders, session shared by psychologist
- Mark as read / Mark all as read with optimistic updates and rollback on failure
- Filter by type or date
- Notification types: appointment, payment, session_shared, system

#### Profile & Preferences
- View/update name, email, phone, birth date, address
- Timezone preference (defaults to tenant timezone)
- Email notification preferences (appointment reminders: yes/no, payment reminders: yes/no)
- Language preference (Portuguese - hardcoded)

### Authentication

- **Separate Auth System**: Patient portal uses its own JWT token (separate from app staff auth)
- **Magic Link**: Patients receive secure magic link via email; single-click access without password
- **Session Duration**: JWT expires after 30 days; re-authentication required via magic link
- **Device Binding**: Optional device fingerprinting (user agent) for extra security

### Data Model

```
Patient Portal User: Separate from staff auth, linked to Patient record via unique token

Fields: id, patientId, email, portalToken, lastLoginAt, preferences {
  timezone, emailNotifications { appointments, payments }, language
}

Journal Entry: { id, patientId, date, mood (1-10), anxiety (1-10), energy (1-10),
  sleep (1-10), emotionTags[], noteText (encrypted), visibility, crisisDetected,
  createdAt, updatedAt }

Notification: { id, patientId, type, title, message, read, createdAt, expiresAt }
```

### Privacy & Security

- **End-to-End Encryption**: Journal noteText encrypted with patient-specific key
- **PHI Isolation**: Portal data isolated from staff application data at database level (separate schemas or encryption keys)
- **No Password Storage**: Magic link eliminates password reuse and compromise risks
- **Consent Tracking**: All consent changes logged with old/new values
- **Audit Trail**: All patient actions (journal entry, payment, consent change) audit-logged

### Access Control

- Patients can only access their own data
- Psychologist can view shared journal entries and session history
- Portal does not support role-based access (all authenticated patients have same permissions)

## 6. File Management

The File Management domain handles document uploads, storage, retrieval, and compliance.

### Key Features

- **Upload to Supabase Storage**: Files stored in Supabase Storage (S3 or R2 backend)
- **Magic-Byte MIME Validation**: File magic bytes verified against MIME type declaration to prevent malicious file uploads
- **File Size Limit**: 25 MB per file; checked before upload
- **Signed URLs**: Time-limited download links (1-hour expiry) preventing unauthorized access
- **Soft-Delete**: Deleted files retained for 30 days before permanent removal
- **Clinical Flag**: Files marked as clinical (treatment notes, assessments, etc.) restricted to treatment team; administrative files (invoices, consents) have broader access

### Data Model

```
fields: id, tenantId, uploadedByUserId, originalFileName, mimeType, fileSize (bytes),
        storageKey, signedUrl (ephemeral), isClinical (boolean), relatedEntity
        (patientId/appointmentId/sessionId/chargeId), expiresAt, createdAt,
        updatedAt, deletedAt
```

### Upload Process

1. Client sends file with MIME type declaration
2. Server validates file size ≤ 25 MB
3. Extract file magic bytes; verify against declared MIME type
4. Upload to Supabase Storage at path: `tenants/{tenantId}/files/{fileId}`
5. Generate signed URL (1-hour expiry)
6. Store metadata in database with isClinical flag

### Access Control

- **Clinical Files** (treatment notes, audio, assessments):
  - SUPERADMIN: View all
  - TENANT_ADMIN: View all within tenant
  - PSYCHOLOGIST: View own uploaded; view own patient's clinical files
  - ASSISTANT: View clinical files under supervision
  - READONLY: No access
- **Administrative Files** (invoices, consents, contracts):
  - All authenticated users in tenant can view

### Download Flow

1. Client requests file via signed URL
2. Supabase validates signature (expiry, authenticity)
3. Return 1-hour signed download URL
4. Audit log records download action

## 7. Audit & Compliance

The Audit domain provides immutable, comprehensive logging for regulatory compliance and incident investigation.

### Audit Actions (49 Total)

**Authentication & Access**
- user.login, user.logout, user.password_reset, user.mfa_enabled, user.mfa_disabled, user.session_created, user.session_terminated

**Patient Management**
- patient.created, patient.updated, patient.archived, patient.unarchived, patient.deleted, patient.consent_given, patient.consent_withdrawn, patient.portal_invite_sent

**Appointment Management**
- appointment.created, appointment.updated, appointment.scheduled, appointment.confirmed, appointment.completed, appointment.cancelled, appointment.no_show

**Clinical Sessions & Notes**
- session.created, session.updated, session.deleted, session.revision_created, session.accessed

**Charges & Payments**
- charge.created, charge.updated, payment.recorded, payment.refunded, charge.marked_overdue

**File Management**
- file.uploaded, file.downloaded, file.deleted, file.accessed

**Portal Activity**
- portal.login, journal_entry.created, journal_entry.updated, notification.sent, consent.updated

**Administrative**
- user.created, user.updated, user.role_changed, tenant.settings_updated, audit.exported, data_export_requested

### PHI Redaction (21 Sensitive Keys)

To protect privacy in audit logs, sensitive data is redacted before storage:

```
Redacted Keys: cpf, noteText, email (partially), phone (partially),
               journalNote, cardNumber, bankAccount, ssn, idNumber,
               address, birthDate, medicalHistory, medication,
               diagnosis, psychologistNotes, patientNotes,
               financialData, insuranceId, emergencyContact,
               governmentId, dateOfBirth
```

Example: `{ "patientId": 123, "cpf": "[REDACTED]", "name": "João Silva" }`

### Data Model

```
fields: id, tenantId, userId, action, resource (patient/appointment/session/etc),
        resourceId, changes { before, after }, ipAddress, userAgent, timestamp,
        metadata { endpoint, method, statusCode }
```

### Access Control

- SUPERADMIN: View all audit logs across all tenants
- TENANT_ADMIN: View all audit logs within tenant; export to CSV
- Others: No direct access (audit logging is system-generated)

### Export & Retention

- **CSV Export**: Available to TENANT_ADMIN; max 90 days lookback; max 50,000 rows per export to prevent memory exhaustion
- **Data Retention**: Audit logs retained for 7 years (Brazilian tax and labor law requirement)
- **Immutability**: Audit records are append-only; no updates or deletions

## 8. Email & Notifications

Email and notification management ensures timely, compliant communication with patients and staff.

### Resend Integration

Emails sent via Resend SDK (transactional email service). Production: live sending. Development: console fallback (no actual email sent).

### Email Templates (11 Total)

1. **Magic Link**: Patient portal access link
2. **Invite Patient**: Invite to portal with acceptance required
3. **Appointment Confirmation**: Patient + psychologist confirmation with details
4. **Appointment Reminder**: 24-hour reminder before appointment
5. **Appointment Cancellation**: Notification of cancellation with reason
6. **Payment Reminder**: Overdue payment notification
7. **Payment Received**: Confirmation of payment with receipt
8. **Invoice**: PDF invoice for session/charge
9. **Portal Session Shared**: Notification that psychologist shared session with patient
10. **Journal Alert**: Crisis keyword detected in journal entry
11. **System Notification**: Generic administrative notices

### Template Customization

- **Reminder Templates**: Each tenant can customize reminder email content (appointment and payment reminders)
- **Tenant Branding**: Logo, practice name, contact info personalized per tenant
- **Variables**: `{patientName}`, `{appointmentTime}`, `{psychologistName}`, `{amount}`, `{dueDate}`, etc.

### Notification Center (In-App)

- Resend emails are fire-and-forget; in-app notifications for patient portal
- Types: appointment, payment, session_shared, system
- Stored in database with read/unread state
- Optimistic updates supported (mark as read/all read with rollback)

### Cron Jobs

**Payment Reminder Cron** (daily, 9 AM tenant timezone)

```
Every day at 9 AM (tenant timezone):
  Query: charges WHERE status = PENDING AND dueDate = TODAY
  Action: Send payment reminder email to patient
  Log: Audit entry for email.sent action
```

### Access Control

- TENANT_ADMIN: View/edit reminder templates, resend failed emails
- PSYCHOLOGIST: Trigger appointment confirmations, payment reminders (manual)
- System: Automatic reminder emails via cron

### Compliance

- **Unsubscribe Links**: All marketing emails include unsubscribe link (not applicable to transactional emails)
- **Opt-In/Opt-Out**: Patient portal preferences respect email notification preferences
- **Audit Trail**: All email sends audit-logged with timestamp, recipient, template, status
- **LGPD**: Email addresses only collected with explicit consent; retention policy aligns with GDPR principles
