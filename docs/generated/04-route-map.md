# Route Map

Complete documentation of all routes in the Psycologger application, grouped by domain and authentication context.

---

## Frontend Pages

### Public Routes

All unauthenticated routes accessible from the landing page or via direct URL.

| Route | Purpose |
|-------|---------|
| `/` | Landing page / home |
| `/login` | Staff login (email magic-link) |
| `/signup` | New clinic registration |
| `/pricing` | Pricing plans and features |
| `/terms` | Terms of Service |
| `/privacy` | Privacy Policy |
| `/invite/[token]` | Staff invitation acceptance flow |
| `/onboarding` | Post-signup clinic setup wizard |
| `/docs` | Documentation index |
| `/docs/guide` | User guide |
| `/docs/api` | API reference |

### Staff Application (/app/*)

Protected routes for authenticated clinic staff (psychologists, assistants, etc.). Require valid JWT session and appropriate role-based permissions.

**Dashboard & Calendar**

| Route | Purpose | Required Permission |
|-------|---------|---------------------|
| `/app/today` | Daily appointment overview | appointments:view |
| `/app/calendar` | Month/week calendar view | appointments:view |

**Patients Management**

| Route | Purpose | Required Permission |
|-------|---------|---------------------|
| `/app/patients` | Patient list with search/filter | patients:list |
| `/app/patients/new` | Create new patient record | patients:create |
| `/app/patients/[id]` | Patient detail view | patients:view |
| `/app/patients/[id]/edit` | Edit patient information | patients:edit |

**Appointments**

| Route | Purpose | Required Permission |
|-------|---------|---------------------|
| `/app/appointments/new` | Schedule new appointment | appointments:create |
| `/app/appointments/[id]` | Appointment detail/reschedule | appointments:edit |

**Sessions & Clinical Notes**

| Route | Purpose | Required Permission |
|-------|---------|---------------------|
| `/app/sessions/[id]` | View/edit session notes | sessions:view, sessions:edit |

**Financial Management**

| Route | Purpose | Required Permission |
|-------|---------|---------------------|
| `/app/financial/page` | Financial overview dashboard | charges:view |
| `/app/financial/charges` | Charges/invoice list | charges:view |
| `/app/financial/charges/new` | Create new charge | charges:create |

**Reporting & Analytics**

| Route | Purpose | Required Permission |
|-------|---------|---------------------|
| `/app/reports` | Financial reports, analytics, cashflow | reports:view |

**Administration**

| Route | Purpose | Required Permission |
|-------|---------|---------------------|
| `/app/journal-inbox` | Pending journal entries for review | journal-inbox:manage |
| `/app/audit` | Audit log viewer | audit:view |

**Settings**

| Route | Purpose | Required Permission |
|-------|---------|---------------------|
| `/app/settings/page` | General settings overview | settings:view |
| `/app/settings/profile` | User profile management | settings:editOwnProfile |
| `/app/settings/clinic` | Clinic details and configuration | settings:editClinic |
| `/app/settings/users` | Team member management | users:list, users:create, users:edit |
| `/app/settings/appointment-types` | Appointment type definitions | appointmentTypes:manage |
| `/app/settings/reminders` | Payment reminder templates | reminders:manage |
| `/app/settings/export` | Data export functionality | export:manage |
| `/app/settings/integrations` | Third-party integrations | integrations:manage |

### SuperAdmin Routes (/sa/*)

Protected routes for platform administrators. Require `isSuperAdmin` flag in JWT.

| Route | Purpose |
|-------|---------|
| `/sa/login` | SuperAdmin login |
| `/sa/dashboard` | Platform overview and metrics |
| `/sa/users` | All platform users (paginated) |
| `/sa/tenants` | All tenant organizations |
| `/sa/tenants/[id]` | Tenant detail and configuration |
| `/sa/impersonate` | Impersonate a staff user for support |

### Patient Portal Routes (/portal/*)

#### Public Portal Routes

| Route | Purpose |
|-------|---------|
| `/portal/login` | Patient login (email or activation code) |
| `/portal/activate/[token]` | Portal account activation |
| `/portal/magic-login/[token]` | Magic link login completion |

#### Authenticated Portal Routes

Require valid PatientPortalSession (cookie + token hash verification).

| Route | Purpose |
|-------|---------|
| `/portal/dashboard` | Patient appointment and journal overview |
| `/portal/sessions` | List of attended sessions with notes |
| `/portal/sessions/[id]` | Session detail (notes, files, homework) |
| `/portal/journal` | Personal journal entry list |
| `/portal/journal/new` | Create new journal entry |
| `/portal/journal/[id]` | View/edit journal entry |
| `/portal/payments` | Payment history and invoices |
| `/portal/profile` | Patient profile and preferences |
| `/portal/notifications` | In-app notifications and alerts |
| `/portal/privacy` | Privacy controls and data management |
| `/portal/help` | Help and FAQ |

---

## API Routes

Complete REST API with 40+ endpoints. All API routes require authentication unless noted.

### Authentication Routes

**Auth Provider Integration**

- **Route:** `/api/auth/[...nextauth]`
- **Methods:** GET, POST
- **Purpose:** NextAuth callback handler for magic-link provider
- **Auth Required:** No (NextAuth internal)
- **Roles:** N/A

**Onboarding**

- **Route:** `/api/v1/onboarding`
- **Method:** POST
- **Purpose:** Complete clinic setup after signup
- **Auth Required:** Yes (staff with TENANT_ADMIN role)
- **Roles:** TENANT_ADMIN
- **Payload:** clinic name, subscription tier, timezone, notification preferences

**Staff Invitations**

- **Route:** `/api/v1/invites/[token]`
- **Method:** GET, POST
- **Purpose:** Validate and accept staff invitations
- **Auth Required:** No (token-based)
- **Roles:** N/A

### Profile Routes

**Get/Update Staff Profile**

- **Route:** `/api/v1/profile`
- **Methods:** GET, PATCH
- **Purpose:** Retrieve and update authenticated user profile
- **Auth Required:** Yes
- **Roles:** All authenticated users
- **PATCH Payload:** name, email, preferences, timezone
- **GET Response:** Current user details, clinic association, permissions

### Users Management Routes

**List Clinic Users (Paginated)**

- **Route:** `/api/v1/users`
- **Method:** GET
- **Query Params:** page (default 1), limit (default 20)
- **Purpose:** List all staff members in tenant clinic
- **Auth Required:** Yes
- **Roles:** TENANT_ADMIN, PSYCHOLOGIST (self only with READONLY scope)
- **Response:** Paginated user list with roles and status

**Invite New Staff Member**

- **Route:** `/api/v1/users`
- **Method:** POST
- **Purpose:** Send invitation to new staff member
- **Auth Required:** Yes
- **Roles:** TENANT_ADMIN
- **Payload:** email, role (PSYCHOLOGIST | ASSISTANT | READONLY), sendEmail (optional)
- **Response:** Invitation token and status

### Settings Routes

**Get/Update Clinic Settings**

- **Route:** `/api/v1/settings`
- **Methods:** GET, PATCH
- **Purpose:** Manage clinic configuration
- **Auth Required:** Yes
- **Roles:** TENANT_ADMIN
- **GET Response:** Currency, timezone, language, adminCanViewClinical, paymentReminder settings
- **PATCH Payload:** Any settings field

**List Integrations**

- **Route:** `/api/v1/integrations`
- **Method:** GET
- **Purpose:** List available and configured integrations
- **Auth Required:** Yes
- **Roles:** TENANT_ADMIN
- **Response:** Active integrations with connection status

### Appointment Types Routes

**List Appointment Types**

- **Route:** `/api/v1/appointment-types`
- **Method:** GET
- **Purpose:** Get all appointment types for clinic
- **Auth Required:** Yes
- **Roles:** All authenticated
- **Response:** Name, duration, color, pricing

**Create Appointment Type**

- **Route:** `/api/v1/appointment-types`
- **Method:** POST
- **Purpose:** Define new appointment type
- **Auth Required:** Yes
- **Roles:** TENANT_ADMIN
- **Payload:** name, durationMinutes, priceInCents, color

**Update/Delete Appointment Type**

- **Route:** `/api/v1/appointment-types/[id]`
- **Methods:** PATCH, DELETE
- **Purpose:** Modify or remove appointment type
- **Auth Required:** Yes
- **Roles:** TENANT_ADMIN
- **PATCH Payload:** name, durationMinutes, priceInCents, color
- **DELETE Response:** Success confirmation

### Patients Routes

**List Patients (Paginated)**

- **Route:** `/api/v1/patients`
- **Method:** GET
- **Query Params:** page, limit, search, filter (active/inactive)
- **Purpose:** Get patients for staff member
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT, READONLY
- **Scope:** PSYCHOLOGIST sees assigned patients; others see all
- **Response:** Paginated patient list with contact and appointment count

**Create New Patient**

- **Route:** `/api/v1/patients`
- **Method:** POST
- **Purpose:** Register new patient
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT
- **Payload:** firstName, lastName, email, phone, cpf (optional), birthDate, address, notes
- **Response:** Created patient record with ID

**Get Patient Detail**

- **Route:** `/api/v1/patients/[id]`
- **Method:** GET
- **Purpose:** Retrieve full patient record
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned), ASSISTANT (assigned)
- **Response:** Patient data with appointment history, session notes, charges

**Update Patient**

- **Route:** `/api/v1/patients/[id]`
- **Method:** PATCH
- **Purpose:** Update patient information
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned), ASSISTANT (assigned)
- **Payload:** firstName, lastName, phone, email, address, notes, status (active/inactive)

**Delete Patient**

- **Route:** `/api/v1/patients/[id]`
- **Method:** DELETE
- **Purpose:** Soft-delete patient (30-day retention)
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned)
- **Response:** Deletion timestamp

**Send Portal Invitation**

- **Route:** `/api/v1/patients/[id]/portal-invite`
- **Method:** POST
- **Purpose:** Email activation link to patient for portal access
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT (assigned)
- **Response:** Invite token and email status

**Manage Patient Files**

- **Route:** `/api/v1/patients/[id]/files/[fileId]`
- **Methods:** PATCH, DELETE
- **Purpose:** Update file metadata or remove attachment
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT (assigned)
- **PATCH Payload:** metadata, notes
- **DELETE Response:** Success confirmation

### Appointments Routes

**List Appointments**

- **Route:** `/api/v1/appointments`
- **Method:** GET
- **Query Params:** page, limit, patientId, status (scheduled/completed/cancelled), dateRange
- **Purpose:** Get appointments for clinic or patient
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT, READONLY
- **Response:** Paginated appointment list with patient and type details

**Create Appointment**

- **Route:** `/api/v1/appointments`
- **Method:** POST
- **Purpose:** Schedule new appointment
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT
- **Payload:** patientId, appointmentTypeId, scheduledAt, notes, reminderEnabled
- **Response:** Created appointment with ID and confirmation

**Get Appointment Detail**

- **Route:** `/api/v1/appointments/[id]`
- **Method:** GET
- **Purpose:** Retrieve appointment details
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT, READONLY
- **Response:** Full appointment data with patient, type, session link

**Reschedule/Update Appointment**

- **Route:** `/api/v1/appointments/[id]`
- **Method:** PATCH
- **Purpose:** Modify appointment date/time or status
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT
- **Payload:** scheduledAt, notes, status (scheduled/completed/cancelled)
- **Response:** Updated appointment with confirmation sent to patient

### Sessions Routes

**List Sessions**

- **Route:** `/api/v1/sessions`
- **Method:** GET
- **Query Params:** page, limit, patientId, status (draft/completed/archived)
- **Purpose:** Get session records
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (own notes), conditional on adminCanViewClinical
- **Response:** Paginated session list with summary

**Create Session**

- **Route:** `/api/v1/sessions`
- **Method:** POST
- **Purpose:** Start new clinical session
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST
- **Payload:** appointmentId (optional), patientId, sessionDate, initialNotes
- **Response:** Created session with ID

**Get Session Detail**

- **Route:** `/api/v1/sessions/[id]`
- **Method:** GET
- **Purpose:** Retrieve full session with clinical notes
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned), conditional on adminCanViewClinical
- **Response:** Session data, encrypted notes, attachments, homework

**Update Session**

- **Route:** `/api/v1/sessions/[id]`
- **Method:** PATCH
- **Purpose:** Update notes, status, or homework
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned)
- **Payload:** noteText, status (draft/completed), homework, nextSessionPlanned
- **Response:** Updated session

**Delete Session**

- **Route:** `/api/v1/sessions/[id]`
- **Method:** DELETE
- **Purpose:** Soft-delete session (30-day retention)
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned)
- **Response:** Deletion timestamp

**List Session Files**

- **Route:** `/api/v1/sessions/[id]/files`
- **Method:** GET
- **Purpose:** Get attachments for session
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned), conditional on adminCanViewClinical
- **Response:** File list with names, sizes, types

**Upload Session File**

- **Route:** `/api/v1/sessions/[id]/files`
- **Method:** POST
- **Purpose:** Attach file to session
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned)
- **Payload:** file (multipart), description
- **Response:** Uploaded file metadata with URL

**Get/Delete Session File**

- **Route:** `/api/v1/sessions/[id]/files/[fileId]`
- **Methods:** GET, DELETE
- **Purpose:** Download or remove attachment
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST (assigned), conditional on adminCanViewClinical for GET
- **Response:** File download URL or deletion confirmation

### Charges & Financial Routes

**List Charges**

- **Route:** `/api/v1/charges`
- **Method:** GET
- **Query Params:** page, limit, patientId, status (pending/paid/overdue), dateRange
- **Purpose:** Get invoices/charges for clinic
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT, READONLY
- **Response:** Paginated charge list with amounts, payment status

**Create Charge**

- **Route:** `/api/v1/charges`
- **Method:** POST
- **Purpose:** Create invoice for patient
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT
- **Payload:** patientId, amount (in cents), description, dueDate, appointmentTypeId (optional)
- **Response:** Created charge with ID

**Update Charge**

- **Route:** `/api/v1/charges/[id]`
- **Method:** PATCH
- **Purpose:** Update charge status or amount
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT
- **Payload:** status (pending/paid/cancelled), paidAt (for marking paid)
- **Response:** Updated charge

**Delete Charge**

- **Route:** `/api/v1/charges/[id]`
- **Method:** DELETE
- **Purpose:** Soft-delete charge (30-day retention)
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST
- **Response:** Deletion confirmation

**Record Payment**

- **Route:** `/api/v1/payments`
- **Method:** POST
- **Purpose:** Register payment received from patient
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, ASSISTANT
- **Payload:** chargeId, amountPaid (in cents), paymentMethod (cash/transfer/credit_card/pix), reference
- **Response:** Payment record created, charge marked paid

### Reports Routes

**Generate Reports**

- **Route:** `/api/v1/reports`
- **Method:** GET
- **Query Params:** type (monthly|dashboard|cashflow|previsibility), startDate, endDate, format (json|csv)
- **Purpose:** Generate financial and operational reports
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, TENANT_ADMIN
- **Response:** Report data or CSV file
- **Types:**
  - `monthly`: Monthly revenue summary by appointment type
  - `dashboard`: KPIs (appointments, revenue, conversion)
  - `cashflow`: Payment timeline and projected cash
  - `previsibility`: Revenue forecast by patient

### Audit Routes

**List Audit Log**

- **Route:** `/api/v1/audit`
- **Method:** GET
- **Query Params:** page, limit, entityType (User|Patient|Charge|Session), action (create|update|delete), dateRange, format (json|csv)
- **Purpose:** Retrieve audit trail of actions
- **Auth Required:** Yes
- **Roles:** TENANT_ADMIN
- **Response:** Paginated audit entries or CSV export

### Reminder Templates Routes

**List/Create Reminder Templates**

- **Route:** `/api/v1/reminder-templates`
- **Methods:** GET, POST
- **Purpose:** Manage payment reminder email templates
- **Auth Required:** Yes
- **Roles:** TENANT_ADMIN
- **GET Response:** List of templates with content
- **POST Payload:** subject, body (with {{variables}}), daysBeforeDue, enabled

### Journal Inbox Routes

**List Pending Entries**

- **Route:** `/api/v1/journal-inbox`
- **Method:** GET
- **Query Params:** page, limit, status (pending|reviewed)
- **Purpose:** Get patient journal entries awaiting review
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST, TENANT_ADMIN
- **Response:** Paginated pending entries with patient and date

**Review Journal Entry**

- **Route:** `/api/v1/journal-inbox/[id]/review`
- **Method:** PATCH
- **Purpose:** Mark entry as reviewed and add professional notes
- **Auth Required:** Yes
- **Roles:** PSYCHOLOGIST
- **Payload:** status (reviewed), professionalNotes, tags
- **Response:** Updated entry with review metadata

### Cron Routes

**Trigger Payment Reminders**

- **Route:** `/api/v1/cron/payment-reminders`
- **Method:** POST
- **Purpose:** Scheduled job to send payment reminders
- **Auth Required:** Yes (Bearer token in Authorization header)
- **Roles:** N/A (system)
- **Security:** Uses CRON_SECRET token, IP whitelist for Vercel cron
- **Payload:** (empty)
- **Response:** Reminders sent count and status

### Portal Authentication Routes

**Portal Auth Multi-Action Endpoint**

- **Route:** `/api/v1/portal/auth`
- **Method:** GET, POST
- **Purpose:** Central handler for patient portal authentication flows
- **Auth Required:** Conditional (depends on action)
- **Actions:**
  - `GET` - List active sessions for current patient
  - `POST magic-link-request` - Send magic link to email (no auth required)
  - `POST verify` - Verify magic link token (no auth required)
  - `POST activate` - Activate patient account with token (no auth required)
  - `POST logout` - Logout from portal (requires auth)
- **Response:** Session token, patient data, or confirmation

### Portal Patient Routes

**Dashboard Overview**

- **Route:** `/api/v1/portal/dashboard`
- **Method:** GET
- **Purpose:** Patient appointment and journal summary
- **Auth Required:** Yes (PatientPortalSession)
- **Response:** Upcoming appointments, recent sessions, journal count

**Appointments Management**

- **Route:** `/api/v1/portal/appointments`
- **Methods:** GET, PATCH
- **Purpose:** View appointments and cancel if allowed
- **Auth Required:** Yes
- **GET Response:** List of appointments with details
- **PATCH (id):** Cancel appointment with reason
- **Query:** status filter, date range

**Charges & Payments**

- **Route:** `/api/v1/portal/charges`
- **Method:** GET
- **Purpose:** View invoices and payment history
- **Auth Required:** Yes
- **Response:** Charges with payment status, due dates

**Journal Management**

- **Route:** `/api/v1/portal/journal`
- **Methods:** GET, POST
- **Purpose:** Patient journal CRUD
- **Auth Required:** Yes
- **GET Response:** List journal entries
- **POST Payload:** title, content, mood (1-5), tags
- **GET [id]:** View single entry
- **PATCH [id]:** Edit entry
- **DELETE [id]:** Remove entry

**Notifications**

- **Route:** `/api/v1/portal/notifications`
- **Methods:** GET, PATCH
- **Purpose:** In-app notifications management
- **Auth Required:** Yes
- **GET Response:** Paginated notification list with read status
- **PATCH:** Mark as read, read-all action

**Profile Management**

- **Route:** `/api/v1/portal/profile`
- **Methods:** GET, PATCH
- **Purpose:** Patient profile and preferences
- **Auth Required:** Yes
- **GET Response:** Patient data, preferences, contact info
- **PATCH Payload:** phone, address, preferences, notifications settings

**Consents Management**

- **Route:** `/api/v1/portal/consents`
- **Methods:** GET, POST
- **Purpose:** GDPR/privacy consents tracking
- **Auth Required:** Yes
- **GET Response:** List of consents with acceptance status
- **POST Payload:** consentType, accepted, timestamp
- **Response:** Consent record created

---

## Route Security Summary

| Route Category | Auth Method | Session Storage | CSRF Protection |
|----------------|------------|-----------------|-----------------|
| `/api/auth/*` | NextAuth | JWT in httpOnly cookie | NextAuth CSRF token |
| `/api/v1/*` (staff) | JWT | httpOnly cookie | Double-submit CSRF cookie |
| `/portal/*` (patient) | PatientPortalSession | Cookie + token hash | Double-submit CSRF cookie |
| `/sa/*` (superadmin) | JWT + isSuperAdmin flag | httpOnly cookie | Double-submit CSRF cookie |

All state-changing requests (POST, PATCH, DELETE) outside of `/api/auth/`, `/api/v1/cron/`, and `/api/v1/portal/auth` require valid CSRF tokens.
